import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PayloadJwt, UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Valida o token Bearer e resolve o usuario correspondente.
 * O retorno deste metodo e anexado a requisicao como `req.user`.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.segredo')!,
    });
  }

  async validate(payload: PayloadJwt): Promise<UsuarioAutenticado> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { id: true, nome: true, email: true, versaoSessao: true },
    });

    // Token valido mas usuario removido: o acesso deve ser negado.
    if (!usuario) {
      throw new UnauthorizedException('Usuario do token nao existe mais');
    }

    // A versao muda quando a senha e redefinida: tokens emitidos antes disso
    // (inclusive um roubado) deixam de valer, mesmo com assinatura e prazo em dia.
    if (usuario.versaoSessao !== payload.ver) {
      throw new UnauthorizedException('Sessao encerrada; faca login novamente');
    }

    return { id: usuario.id, nome: usuario.nome, email: usuario.email };
  }
}
