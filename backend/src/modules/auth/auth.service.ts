import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PayloadJwt } from '../../common/types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaLogoutDto } from './dto/resposta-logout.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    try {
      const usuario = await this.prisma.usuario.create({
        data: { nome: dto.nome.trim(), email: emailNormalizado, senhaHash },
        select: { id: true, nome: true, email: true },
      });

      return { accessToken: this.gerarToken(usuario.id, usuario.email), usuario };
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Ja existe uma conta com este e-mail');
      }

      throw erro;
    }
  }

  /**
   * RF02 - Autentica o usuario validando e-mail e hash da senha (RNF03).
   * @param dto Credenciais contendo e-mail e senha.
   * @throws UnauthorizedException Se o e-mail ou senha forem invalidos.
   * @returns Token JWT de acesso e dados publicos do usuario.
   */
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
   * RF02 - Encerra a sessao do usuario (logout).
   * Em arquitetura JWT stateless, confirma a operacao para descarte do token no cliente.
   * @param usuarioId Identificador do usuario que solicitou o encerramento.
   * @returns Mensagem de confirmacao do logout.
   */
  async logout(usuarioId: number): Promise<RespostaLogoutDto> {
    void usuarioId;
    return {
      mensagem: 'Logout realizado com sucesso',
    };
  }

  /**
   * RF03 - recuperacao de senha por e-mail (prioridade Media).
   * TODO: gerar token de uso unico com expiracao, persistir e disparar o e-mail.
   * Depende da definicao do provedor de envio (fora do escopo do boilerplate).
   */
  async solicitarRecuperacaoSenha(email: string): Promise<void> {
    void email;
    return;
  }

  /**
   * Gera o token de acesso assinado contendo identificador e e-mail no payload JWT.
   * @param id Identificador do usuario.
   * @param email E-mail do usuario.
   * @returns Token JWT assinado.
   */
  private gerarToken(id: number, email: string): string {
    const payload: PayloadJwt = { sub: id, email };
    return this.jwtService.sign(payload);
  }
}

