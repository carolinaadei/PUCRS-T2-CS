import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PayloadJwt } from '../../common/types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaVerificacaoDto } from './dto/resposta-verificacao.dto';

/** RF03 - janela de validade do codigo de 6 digitos enviado por e-mail. */
const MINUTOS_VALIDADE_CODIGO = 15;

/** RF03 - janela para concluir a troca depois que o codigo conferiu. */
const MINUTOS_VALIDADE_TROCA = 10;

/**
 * RF03 - codigos errados aceitos antes de queimar o registro.
 * Sem isto, 10^6 combinacoes sao poucas para quem consegue trocar de IP e
 * escapar do ThrottlerGuard.
 */
const MAX_TENTATIVAS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /** RF01 - cria a conta com a senha armazenada em hash (RNF03). */
  async registrar(dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    const emailNormalizado = dto.email.trim().toLowerCase();

    const jaExiste = await this.prisma.usuario.findUnique({
      where: { email: emailNormalizado },
      select: { id: true },
    });

    if (jaExiste) {
      throw new ConflictException('Ja existe uma conta com este e-mail');
    }

    const saltRounds = this.configService.get<number>('seguranca.saltRounds')!;
    const senhaHash = await bcrypt.hash(dto.senha, saltRounds);

    const usuario = await this.prisma.usuario.create({
      data: { nome: dto.nome.trim(), email: emailNormalizado, senhaHash },
      select: { id: true, nome: true, email: true },
    });

    return { accessToken: this.gerarToken(usuario.id, usuario.email), usuario };
  }

  /** RF02 - autentica e devolve o token de acesso. */
  async login(dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    const emailNormalizado = dto.email.trim().toLowerCase();

    const usuario = await this.prisma.usuario.findUnique({
      where: { email: emailNormalizado },
    });

    // Mensagem generica de proposito: nao revela se o e-mail existe.
    const credenciaisInvalidas = new UnauthorizedException('E-mail ou senha invalidos');

    if (!usuario) {
      throw credenciaisInvalidas;
    }

    const senhaConfere = await bcrypt.compare(dto.senha, usuario.senhaHash);

    if (!senhaConfere) {
      throw credenciaisInvalidas;
    }

    return {
      accessToken: this.gerarToken(usuario.id, usuario.email),
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    };
  }

  /**
   * RF03 - etapa 1: gera o codigo de 6 digitos e o envia por e-mail.
   * Nunca revela se o e-mail existe: a resposta ao cliente e sempre a mesma.
   */
  async solicitarRecuperacaoSenha(email: string): Promise<void> {
    const emailNormalizado = email.trim().toLowerCase();

    const usuario = await this.prisma.usuario.findUnique({
      where: { email: emailNormalizado },
      select: { id: true, nome: true, email: true },
    });

    if (!usuario) {
      return;
    }

    const codigo = this.gerarCodigo();
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

    // Atalho de desenvolvimento: o nivel `debug` normalmente esta desligado em producao.
    this.logger.debug(`Codigo de recuperacao para ${usuario.email}: ${codigo}`);

    try {
      await this.mailService.enviarEmail(
        { email: usuario.email, nome: usuario.nome },
        'Seu codigo de recuperacao - ViajaJunto',
        this.montarEmailCodigo(codigo),
      );
    } catch (erro) {
      // O codigo ja esta persistido e continua valido; falha de envio nao vaza para o cliente.
      this.logger.error(`Falha ao enviar e-mail de recuperacao: ${String(erro)}`);
    }
  }

  /**
   * RF03 - etapa 2: confere o codigo e emite o token que autoriza a troca.
   * A senha ainda nao muda aqui.
   */
  async verificarCodigo(email: string, codigo: string): Promise<RespostaVerificacaoDto> {
    const emailNormalizado = email.trim().toLowerCase();

    // Mensagem unica para e-mail desconhecido, codigo errado, expirado ou queimado:
    // responder diferente entregaria quais e-mails existem.
    const codigoInvalido = new BadRequestException('Codigo invalido ou expirado');

    const usuario = await this.prisma.usuario.findUnique({
      where: { email: emailNormalizado },
      select: { id: true },
    });

    if (!usuario) {
      throw codigoInvalido;
    }

    // Codigo de uso unico: registros queimados (`usadoEm`) ou ja verificados
    // (`verificadoEm`) ficam de fora da busca.
    const registro = await this.prisma.tokenRecuperacaoSenha.findFirst({
      where: { usuarioId: usuario.id, usadoEm: null, verificadoEm: null },
      orderBy: { criadoEm: 'desc' },
    });

    if (!registro || registro.expiraEm < new Date()) {
      throw codigoInvalido;
    }

    if (!this.codigoConfere(codigo, registro.codigoHash)) {
      const tentativas = registro.tentativas + 1;

      await this.prisma.tokenRecuperacaoSenha.update({
        where: { id: registro.id },
        data: {
          tentativas,
          // Esgotou o teto: queima o codigo em vez de deixar continuar adivinhando.
          ...(tentativas >= MAX_TENTATIVAS ? { usadoEm: new Date() } : {}),
        },
      });

      throw codigoInvalido;
    }

    const tokenTroca = randomBytes(32).toString('base64url');
    const trocaExpiraEm = new Date(Date.now() + MINUTOS_VALIDADE_TROCA * 60 * 1000);

    await this.prisma.tokenRecuperacaoSenha.update({
      where: { id: registro.id },
      data: {
        verificadoEm: new Date(),
        trocaHash: this.hashToken(tokenTroca),
        trocaExpiraEm,
      },
    });

    return { tokenTroca, expiraEm: trocaExpiraEm.toISOString() };
  }

  /** RF03 - etapa 3: troca a senha, autorizada pelo token emitido na etapa 2. */
  async redefinirSenha(
    tokenTroca: string,
    novaSenha: string,
    confirmarNovaSenha: string,
  ): Promise<void> {
    if (novaSenha !== confirmarNovaSenha) {
      throw new BadRequestException('A confirmacao nao confere com a nova senha');
    }

    const registro = await this.prisma.tokenRecuperacaoSenha.findUnique({
      where: { trocaHash: this.hashToken(tokenTroca) },
      select: { id: true, usuarioId: true, trocaExpiraEm: true, usadoEm: true },
    });

    // Mensagem unica para token inexistente, ja usado ou expirado.
    if (
      !registro ||
      registro.usadoEm ||
      !registro.trocaExpiraEm ||
      registro.trocaExpiraEm < new Date()
    ) {
      throw new BadRequestException('Sessao de redefinicao invalida ou expirada');
    }

    const saltRounds = this.configService.get<number>('seguranca.saltRounds')!;
    const senhaHash = await bcrypt.hash(novaSenha, saltRounds);

    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: registro.usuarioId },
        data: { senhaHash },
      }),
      this.prisma.tokenRecuperacaoSenha.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
    ]);
  }

  /** `randomInt` e uniforme e vem do CSPRNG; o padStart preserva zeros a esquerda. */
  private gerarCodigo(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
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

  /** O token de troca tem 256 bits de entropia, logo SHA-256 basta. */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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

  private gerarToken(id: number, email: string): string {
    const payload: PayloadJwt = { sub: id, email };
    return this.jwtService.sign(payload);
  }
}
