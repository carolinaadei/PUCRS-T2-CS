import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { ContextoViagem } from '../types/usuario-autenticado';

/**
 * Injeta o que o AcessoViagemGuard resolveu (papel do usuario, criador) - evita
 * uma segunda consulta ao banco no handler. So existe em rotas com @NivelAcesso.
 */
export const ContextoDaViagem = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): ContextoViagem =>
    ctx.switchToHttp().getRequest<{ viagemContexto: ContextoViagem }>().viagemContexto,
);
