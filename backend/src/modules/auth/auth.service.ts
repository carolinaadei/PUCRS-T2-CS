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
import { createHash, randomBytes } from 'node:crypto';
import { PayloadJwt } from '../../common/types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';

/** RF03 - janela de validade do token de redefinicao. */
const MINUTOS_VALIDADE_TOKEN = 30;

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
   * RF03 - gera o token de uso unico e dispara o e-mail com o link de redefinicao.
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

    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + MINUTOS_VALIDADE_TOKEN * 60 * 1000);

    // Invalida tokens anteriores ainda pendentes: apenas o ultimo link vale.
    await this.prisma.$transaction([
      this.prisma.tokenRecuperacaoSenha.updateMany({
        where: { usuarioId: usuario.id, usadoEm: null },
        data: { usadoEm: new Date() },
      }),
      this.prisma.tokenRecuperacaoSenha.create({
        data: { usuarioId: usuario.id, tokenHash: this.hashToken(token), expiraEm },
      }),
    ]);

    const frontendUrl = this.configService.get<string>('frontendUrl')!;
    const link = `${frontendUrl.replace(/\/$/, '')}/redefinir-senha?token=${token}`;

    // Atalho de desenvolvimento: o nivel `debug` normalmente esta desligado em producao.
    this.logger.debug(`Link de redefinicao para ${usuario.email}: ${link}`);

    try {
      await this.mailService.enviarEmail(
        { email: usuario.email, nome: usuario.nome },
        'Redefinicao de senha - ViajaJunto',
        this.montarEmailRecuperacao(usuario.nome, link),
      );
    } catch (erro) {
      // O token ja esta persistido e continua valido; falha de envio nao vaza para o cliente.
      this.logger.error(`Falha ao enviar e-mail de recuperacao: ${String(erro)}`);
    }
  }

  /** RF03 - troca a senha validando o token de uso unico. */
  async redefinirSenha(token: string, novaSenha: string): Promise<void> {
    const registro = await this.prisma.tokenRecuperacaoSenha.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { id: true, usuarioId: true, expiraEm: true, usadoEm: true },
    });

    // Mensagem unica para token inexistente, ja usado ou expirado.
    if (!registro || registro.usadoEm || registro.expiraEm < new Date()) {
      throw new BadRequestException('Token invalido ou expirado');
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

  /** O token tem alta entropia, logo SHA-256 basta (nao e uma senha de usuario). */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private montarEmailRecuperacao(nome: string, link: string): string {
    return `
      <p>Ola, ${nome}!</p>
      <p>Recebemos um pedido para redefinir a senha da sua conta no ViajaJunto.</p>
      <p><a href="${link}">Clique aqui para criar uma nova senha</a></p>
      <p>O link expira em ${MINUTOS_VALIDADE_TOKEN} minutos e pode ser usado uma unica vez.</p>
      <p>Se nao foi voce quem pediu, ignore este e-mail: sua senha atual continua valida.</p>
    `;
  }

  private gerarToken(id: number, email: string): string {
    const payload: PayloadJwt = { sub: id, email };
    return this.jwtService.sign(payload);
  }
}
