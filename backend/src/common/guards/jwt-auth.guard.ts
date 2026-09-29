import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { CHAVE_ROTA_PUBLICA } from '../decorators/publico.decorator';

/**
 * Guard global de autenticacao (RNF03). Rotas anotadas com @Publico()
 * seguem acessiveis a visitantes (RN01).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(contexto: ExecutionContext) {
    const ehPublica = this.reflector.getAllAndOverride<boolean>(CHAVE_ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    if (ehPublica) {
      return true;
    }

    return super.canActivate(contexto);
  }
}
