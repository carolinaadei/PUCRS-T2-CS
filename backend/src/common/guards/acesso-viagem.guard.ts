import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissaoMembro } from '@prisma/client';
import { CHAVE_NIVEL_ACESSO, NivelAcessoViagem } from '../decorators/nivel-acesso.decorator';
import { CodigoErro } from '../erros/codigos-erro';
import { naoEncontrado, proibido } from '../erros/erros';
import { ContextoViagem, PapelNaViagem, UsuarioAutenticado } from '../types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Controle de acesso por viagem.
 *
 * Le o parametro de rota `:viagemId` e verifica se o usuario autenticado
 * atende ao nivel exigido pelo decorator @NivelAcesso(). O vinculo resolvido
 * fica em `req.viagemContexto` para reuso pelos controllers.
 */
@Injectable()
export class AcessoViagemGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const nivelExigido = this.reflector.getAllAndOverride<NivelAcessoViagem>(CHAVE_NIVEL_ACESSO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);

    // Sem @NivelAcesso o guard nao se aplica.
    if (!nivelExigido) {
      return true;
    }

    const requisicao = contexto.switchToHttp().getRequest<{
      user: UsuarioAutenticado;
      params?: { viagemId?: string };
      viagemContexto?: ContextoViagem;
    }>();
    const usuario = requisicao.user;
    const viagemId = requisicao.params?.viagemId;

    if (!viagemId) {
      throw new Error('Rota protegida por @NivelAcesso exige o parametro :viagemId');
    }

    const viagem = await this.prisma.viagem.findUnique({
      where: { id: viagemId },
      select: {
        id: true,
        criadoPor: true,
        membros: { where: { usuarioId: usuario.id }, select: { permissao: true } },
      },
    });

    // Quem nao participa recebe 404, e nao 403: nao revelamos que a viagem existe.
    const ehCriador = viagem?.criadoPor === usuario.id;
    const vinculo = viagem?.membros[0];

    if (!viagem || (!ehCriador && !vinculo)) {
      throw naoEncontrado(CodigoErro.VIAGEM_NAO_ENCONTRADA, 'Viagem nao encontrada');
    }

    const papel: PapelNaViagem = ehCriador ? 'CRIADOR' : vinculo!.permissao;

    if (nivelExigido === NivelAcessoViagem.CRIADOR && papel !== 'CRIADOR') {
      throw proibido(
        CodigoErro.APENAS_CRIADOR,
        'Apenas o criador da viagem pode executar esta acao',
      );
    }

    if (nivelExigido === NivelAcessoViagem.EDITOR && papel === PermissaoMembro.VISUALIZADOR) {
      throw proibido(
        CodigoErro.SOMENTE_LEITURA,
        'Seu nivel de permissao nesta viagem e somente leitura',
      );
    }

    requisicao.viagemContexto = { viagemId: viagem.id, papel };

    return true;
  }
}
