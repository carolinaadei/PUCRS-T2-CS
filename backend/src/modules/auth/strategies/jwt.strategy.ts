import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CodigoErro } from '../../../common/erros/codigos-erro';
import { naoAutenticado } from '../../../common/erros/erros';
import { PayloadJwt, UsuarioAutenticado } from '../../../common/types/usuario-autenticado';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Valida o access token e resolve o usuario correspondente.
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

    // Token valido mas conta excluida: o acesso deve ser negado.
    if (!usuario) {
      throw naoAutenticado(
        CodigoErro.USUARIO_NAO_ENCONTRADO,
        'A conta deste token nao existe mais',
      );
    }

    // A versao muda no logout geral, na troca e na redefinicao de senha: tokens
    // emitidos antes (inclusive um roubado) deixam de valer, mesmo dentro do prazo.
    if (usuario.versaoSessao !== payload.ver) {
      throw naoAutenticado(CodigoErro.SESSAO_ENCERRADA, 'Sessao encerrada; faca login novamente');
    }

    return { id: usuario.id, nome: usuario.nome, email: usuario.email };
  }
}
