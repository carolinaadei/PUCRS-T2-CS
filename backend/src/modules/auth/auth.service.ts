import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { conflito, naoAutenticado, requisicaoInvalida } from '../../common/erros/erros';
import { PayloadJwt } from '../../common/types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaVerificacaoDto } from './dto/resposta-verificacao.dto';

/** Validade do codigo de 6 digitos enviado por e-mail. */
const MINUTOS_VALIDADE_CODIGO = 15;

/** Janela para concluir a troca depois que o codigo conferiu. */
const MINUTOS_VALIDADE_TROCA = 10;

/**
 * Codigos errados aceitos antes de queimar o registro. Sem isto, 10^6
 * combinacoes sao poucas para quem consegue trocar de IP e escapar do
 * ThrottlerGuard.
 */
const MAX_TENTATIVAS = 5;

/** Sessoes revogadas ficam guardadas este tempo para detectar reuso do refresh token. */
const DIAS_GUARDANDO_REVOGADAS = 7;

const DIA_MS = 24 * 60 * 60 * 1000;

type UsuarioDaSessao = { id: number; nome: string; email: string; versaoSessao: number };

const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /** Ver `obterHashDescartavel`. */
  private hashDescartavel?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // --------------------------- Conta e login ---------------------------

  /** Cria a conta com a senha armazenada em hash e ja abre uma sessao. */
  async registrar(dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    const email = dto.email.trim().toLowerCase();
    const jaCadastrado = () =>
      conflito(CodigoErro.EMAIL_JA_CADASTRADO, 'Ja existe uma conta com este e-mail');

    const existente = await this.prisma.usuario.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existente) {
      throw jaCadastrado();
    }

    const senhaHash = await this.gerarHash(dto.senha);

    try {
      const usuario = await this.prisma.usuario.create({
        data: { nome: dto.nome.trim(), email, senhaHash },
        select: { id: true, nome: true, email: true, versaoSessao: true },
      });

      return await this.abrirSessao(usuario);
    } catch (erro) {
      // A checagem acima resolve o caso comum; o indice unico resolve a corrida
      // entre dois cadastros simultaneos com o mesmo e-mail.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw jaCadastrado();
      }

      throw erro;
    }
  }

  /** Confere e-mail e senha e abre uma sessao nova. */
  async login(dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, nome: true, email: true, versaoSessao: true, senhaHash: true },
    });

    // Mensagem generica de proposito: nao revela se o e-mail existe.
    const credenciaisInvalidas = () =>
      naoAutenticado(CodigoErro.CREDENCIAIS_INVALIDAS, 'E-mail ou senha invalidos');

    if (!usuario) {
      // Roda o bcrypt mesmo assim: sem ele, o e-mail desconhecido responderia
      // dezenas de ms mais rapido, e o tempo entregaria quem tem conta.
      await bcrypt.compare(dto.senha, await this.obterHashDescartavel());
      throw credenciaisInvalidas();
    }

    if (!(await bcrypt.compare(dto.senha, usuario.senhaHash))) {
      throw credenciaisInvalidas();
    }

    return this.abrirSessao(usuario);
  }

  // ------------------------------ Sessoes ------------------------------

  /**
   * Troca um refresh token por um par novo (rotacao). O token apresentado deixa
   * de valer na hora. Se ele ja tinha sido trocado antes, alguem esta usando uma
   * copia - roubada ou vazada -, e todas as sessoes do usuario sao encerradas.
   */
  async renovar(refreshToken: string): Promise<RespostaAutenticacaoDto> {
    const invalido = () =>
      naoAutenticado(
        CodigoErro.REFRESH_TOKEN_INVALIDO,
        'Sessao invalida ou expirada; faca login novamente',
      );

    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: {
        id: true,
        expiraEm: true,
        revogadaEm: true,
        usuario: { select: { id: true, nome: true, email: true, versaoSessao: true } },
      },
    });

    if (!sessao) {
      throw invalido();
    }

    if (sessao.revogadaEm) {
      this.logger.warn(`Refresh token reutilizado pelo usuario ${sessao.usuario.id}`);
      await this.encerrarTodasAsSessoes(sessao.usuario.id);
      throw invalido();
    }

    if (sessao.expiraEm <= new Date()) {
      throw invalido();
    }

    // Condicional: entre duas renovacoes simultaneas com o mesmo token, so uma
    // encontra a sessao ainda aberta.
    const { count } = await this.prisma.sessaoRefresh.updateMany({
      where: { id: sessao.id, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });

    if (count === 0) {
      throw invalido();
    }

    return this.abrirSessao(sessao.usuario);
  }

  /**
   * Encerra apenas a sessao do refresh token informado. Idempotente.
   *
   * A sessao e apagada, e nao marcada como revogada: so tokens trocados na
   * rotacao ficam guardados para detectar reuso. Um token de logout apresentado
   * depois (um front que tenta renovar apos sair) e so invalido, e nao derruba
   * as outras sessoes do usuario.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.sessaoRefresh.deleteMany({ where: { tokenHash: sha256(refreshToken) } });
  }

  /**
   * Encerra todas as sessoes: apaga os refresh tokens e incrementa a versao de
   * sessao, o que faz a JwtStrategy recusar os access tokens ja emitidos. As duas
   * escritas vao na mesma transacao: so uma delas deixaria tokens valendo.
   */
  async encerrarTodasAsSessoes(usuarioId: number): Promise<void> {
    await this.prisma.$transaction((tx) => this.revogarSessoes(tx, usuarioId));
  }

  /** As escritas de `encerrarTodasAsSessoes`, dentro de uma transacao ja aberta. */
  private async revogarSessoes(tx: Prisma.TransactionClient, usuarioId: number): Promise<void> {
    await tx.sessaoRefresh.deleteMany({ where: { usuarioId } });
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { versaoSessao: { increment: 1 } },
    });
  }

  /**
   * Troca a senha de quem esta logado. As demais sessoes sao encerradas e uma
   * nova e aberta, para o dispositivo atual continuar logado.
   */
  async trocarSenha(
    usuarioId: number,
    senhaAtual: string,
    novaSenha: string,
    confirmacao: string,
  ): Promise<RespostaAutenticacaoDto> {
    this.conferirConfirmacao(novaSenha, confirmacao);
    await this.conferirSenha(usuarioId, senhaAtual);

    const senhaHash = await this.gerarHash(novaSenha);

    const usuario = await this.prisma.$transaction(async (tx) => {
      await this.revogarSessoes(tx, usuarioId);
      return tx.usuario.update({
        where: { id: usuarioId },
        data: { senhaHash },
        select: { id: true, nome: true, email: true, versaoSessao: true },
      });
    });

    return this.abrirSessao(usuario);
  }

  /** Lanca SENHA_ATUAL_INCORRETA se a senha nao for a do usuario. */
  async conferirSenha(usuarioId: number, senha: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { senhaHash: true },
    });

    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw requisicaoInvalida(CodigoErro.SENHA_ATUAL_INCORRETA, 'A senha informada nao confere');
    }
  }

  // ------------------------ Recuperacao de senha -----------------------

  /**
   * Etapa 1: gera o codigo de 6 digitos e o envia por e-mail.
   * Nunca revela se o e-mail existe: a resposta ao cliente e sempre a mesma, e
   * chega no mesmo tempo, porque o trabalho roda sem ser esperado. Se fosse
   * esperado, o e-mail cadastrado demoraria mais (gravacao no banco + envio) e
   * o tempo de resposta entregaria quem tem conta.
   */
  solicitarRecuperacaoSenha(email: string): void {
    void this.enviarCodigoRecuperacao(email).catch((erro: unknown) =>
      this.logger.error(`Falha ao processar recuperacao de senha: ${String(erro)}`),
    );
  }

  private async enviarCodigoRecuperacao(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true, nome: true, email: true },
    });

    if (!usuario) {
      return;
    }

    const codigo = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiraEm = new Date(Date.now() + MINUTOS_VALIDADE_CODIGO * 60 * 1000);

    // Invalida codigos anteriores ainda pendentes: apenas o ultimo vale.
    await this.prisma.$transaction([
      this.prisma.tokenRecuperacaoSenha.updateMany({
        where: { usuarioId: usuario.id, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.tokenRecuperacaoSenha.create({
        data: { usuarioId: usuario.id, codigoHash: this.hashCodigo(codigo), expiraEm },
      }),
    ]);

    // Atalho de desenvolvimento: em producao o nivel `debug` fica desligado.
    this.logger.debug(`Codigo de recuperacao para ${usuario.email}: ${codigo}`);

    try {
      await this.mailService.enviar({
        para: { email: usuario.email, nome: usuario.nome },
        assunto: 'Seu codigo de recuperacao - ViajaJunto',
        html: this.montarEmailCodigo(codigo),
        texto:
          `Seu codigo para redefinir a senha no ViajaJunto: ${codigo}\n` +
          `Ele expira em ${MINUTOS_VALIDADE_CODIGO} minutos e vale uma unica vez.`,
      });
    } catch (erro) {
      // O codigo ja esta persistido e continua valido; falha de envio nao vaza para o cliente.
      this.logger.error(`Falha ao enviar e-mail de recuperacao: ${String(erro)}`);
    }
  }

  /** Etapa 2: confere o codigo e emite o token que autoriza a troca. */
  async verificarCodigo(email: string, codigo: string): Promise<RespostaVerificacaoDto> {
    // Mensagem unica para e-mail desconhecido, codigo errado, expirado ou queimado:
    // responder diferente entregaria quais e-mails existem.
    const codigoInvalido = () =>
      requisicaoInvalida(CodigoErro.CODIGO_RECUPERACAO_INVALIDO, 'Codigo invalido ou expirado');

    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });

    if (!usuario) {
      throw codigoInvalido();
    }

    const registro = await this.prisma.tokenRecuperacaoSenha.findFirst({
      where: { usuarioId: usuario.id, usadoEm: null, verificadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    if (!registro || registro.expiraEm < new Date()) {
      throw codigoInvalido();
    }

    // Reserva a tentativa ANTES de conferir o codigo, num UPDATE condicional: o
    // banco serializa o incremento, entao no maximo MAX_TENTATIVAS requisicoes
    // chegam a comparacao, mesmo disparadas em paralelo.
    const reserva = await this.prisma.tokenRecuperacaoSenha.updateMany({
      where: {
        id: registro.id,
        usadoEm: null,
        verificadoEm: null,
        tentativas: { lt: MAX_TENTATIVAS },
      },
      data: { tentativas: { increment: 1 } },
    });

    if (reserva.count === 0) {
      throw codigoInvalido();
    }

    if (!this.codigoConfere(codigo, registro.codigoHash)) {
      // Esgotou o teto: queima o codigo em vez de deixar continuar adivinhando.
      await this.prisma.tokenRecuperacaoSenha.updateMany({
        where: {
          id: registro.id,
          usadoEm: null,
          verificadoEm: null,
          tentativas: { gte: MAX_TENTATIVAS },
        },
        data: { usadoEm: new Date() },
      });

      throw codigoInvalido();
    }

    const tokenTroca = randomBytes(32).toString('base64url');
    const trocaExpiraEm = new Date(Date.now() + MINUTOS_VALIDADE_TROCA * 60 * 1000);

    const emitido = await this.prisma.tokenRecuperacaoSenha.updateMany({
      where: { id: registro.id, usadoEm: null, verificadoEm: null },
      data: { verificadoEm: new Date(), trocaHash: sha256(tokenTroca), trocaExpiraEm },
    });

    if (emitido.count === 0) {
      throw codigoInvalido();
    }

    return { tokenTroca, expiraEm: trocaExpiraEm.toISOString() };
  }

  /** Etapa 3: troca a senha e encerra todas as sessoes abertas. */
  async redefinirSenha(
    tokenTroca: string,
    novaSenha: string,
    confirmarNovaSenha: string,
  ): Promise<void> {
    this.conferirConfirmacao(novaSenha, confirmarNovaSenha);

    const sessaoInvalida = () =>
      requisicaoInvalida(
        CodigoErro.TOKEN_TROCA_INVALIDO,
        'Sessao de redefinicao invalida ou expirada',
      );

    const registro = await this.prisma.tokenRecuperacaoSenha.findUnique({
      where: { trocaHash: sha256(tokenTroca) },
      select: { id: true, usuarioId: true, trocaExpiraEm: true, usadoEm: true },
    });

    // Checagem previa: evita gastar bcrypt com token invalido. A garantia de
    // uso unico esta no UPDATE condicional da transacao.
    if (
      !registro ||
      registro.usadoEm ||
      !registro.trocaExpiraEm ||
      registro.trocaExpiraEm < new Date()
    ) {
      throw sessaoInvalida();
    }

    const senhaHash = await this.gerarHash(novaSenha);

    await this.prisma.$transaction(async (tx) => {
      const consumido = await tx.tokenRecuperacaoSenha.updateMany({
        where: { id: registro.id, usadoEm: null, trocaExpiraEm: { gt: new Date() } },
        data: { usadoEm: new Date() },
      });

      if (consumido.count === 0) {
        throw sessaoInvalida();
      }

      // Quem estava com um token roubado perde o acesso junto com a senha antiga.
      await this.revogarSessoes(tx, registro.usuarioId);
      await tx.usuario.update({ where: { id: registro.usuarioId }, data: { senhaHash } });
    });
  }

  // ------------------------------ Apoio ------------------------------

  /**
   * Emite o par de tokens. O `ver` do JWT prende o access token a versao de
   * sessao vigente; o refresh token e opaco e so o hash dele vai para o banco.
   */
  private async abrirSessao(usuario: UsuarioDaSessao): Promise<RespostaAutenticacaoDto> {
    const agora = Date.now();
    const dias = this.configService.get<number>('jwt.diasRefresh')!;
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiraEm = new Date(agora + dias * DIA_MS);

    // Aproveita para limpar o que nao serve mais nem para detectar reuso.
    await this.prisma.sessaoRefresh.deleteMany({
      where: {
        usuarioId: usuario.id,
        OR: [
          { expiraEm: { lt: new Date(agora) } },
          { revogadaEm: { lt: new Date(agora - DIAS_GUARDANDO_REVOGADAS * DIA_MS) } },
        ],
      },
    });

    await this.prisma.sessaoRefresh.create({
      data: { usuarioId: usuario.id, tokenHash: sha256(refreshToken), expiraEm: refreshExpiraEm },
    });

    const payload: PayloadJwt = {
      sub: usuario.id,
      email: usuario.email,
      ver: usuario.versaoSessao,
    };
    const accessToken = this.jwtService.sign(payload);
    const { exp } = this.jwtService.decode<{ exp: number }>(accessToken);

    return {
      tipoToken: 'Bearer',
      accessToken,
      accessTokenExpiraEm: new Date(exp * 1000).toISOString(),
      refreshToken,
      refreshTokenExpiraEm: refreshExpiraEm.toISOString(),
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    };
  }

  private conferirConfirmacao(novaSenha: string, confirmacao: string) {
    if (novaSenha !== confirmacao) {
      throw requisicaoInvalida(
        CodigoErro.SENHAS_DIVERGENTES,
        'A confirmacao nao confere com a nova senha',
      );
    }
  }

  private gerarHash(senha: string): Promise<string> {
    return bcrypt.hash(senha, this.configService.get<number>('seguranca.saltRounds')!);
  }

  /**
   * Um codigo de 6 digitos tem so 10^6 preimagens: SHA-256 puro seria revertido
   * em segundos por quem lesse o banco. O HMAC com segredo do servidor faz o
   * acesso ao banco, sozinho, nao bastar.
   */
  private hashCodigo(codigo: string): string {
    const segredo = this.configService.get<string>('seguranca.segredoRecuperacao')!;
    return createHmac('sha256', segredo).update(codigo).digest('hex');
  }

  /** Comparacao em tempo constante: o tempo de resposta nao entrega digitos certos. */
  private codigoConfere(codigo: string, hashArmazenado: string): boolean {
    const calculado = Buffer.from(this.hashCodigo(codigo), 'hex');
    const armazenado = Buffer.from(hashArmazenado, 'hex');

    return calculado.length === armazenado.length && timingSafeEqual(calculado, armazenado);
  }

  /** O e-mail carrega apenas o codigo: sem link, nao ha o que clicar num phishing. */
  private montarEmailCodigo(codigo: string): string {
    return `
      <p>Seu codigo para redefinir a senha no ViajaJunto:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:24px 0;">${codigo}</p>
      <p>O codigo expira em ${MINUTOS_VALIDADE_CODIGO} minutos e vale uma unica vez.</p>
      <p>Se nao foi voce quem pediu, ignore este e-mail: sua senha atual continua valida.</p>
    `;
  }

  /**
   * Hash de uma senha aleatoria, com o mesmo custo dos reais, para o `login`
   * comparar quando o e-mail nao existe. Gerado uma vez, no primeiro uso.
   */
  private obterHashDescartavel(): Promise<string> {
    this.hashDescartavel ??= this.gerarHash(randomBytes(16).toString('hex'));
    return this.hashDescartavel;
  }
}
