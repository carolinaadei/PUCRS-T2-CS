import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { UsuarioAutenticado } from '../types/usuario-autenticado';

/**
 * Injeta o usuario autenticado no handler:
 *   listar(@UsuarioAtual() usuario: UsuarioAutenticado) { ... }
 */
export const UsuarioAtual = createParamDecorator(
  (dado: keyof UsuarioAutenticado | undefined, ctx: ExecutionContext) => {
    const requisicao = ctx.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado = requisicao.user;

    return dado ? usuario?.[dado] : usuario;
  },
);
