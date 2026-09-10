import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissaoMembro } from '@prisma/client';
import { CHAVE_NIVEL_ACESSO, NivelAcessoViagem } from '../decorators/nivel-acesso.decorator';
import { UsuarioAutenticado } from '../types/usuario-autenticado';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Controle de acesso por viagem (RNF03, RN02, RN03, RN04, RN06).
 *
 * Le o parametro de rota `:viagemId` e verifica se o usuario autenticado
 * atende ao nivel exigido pelo decorator @NivelAcesso(). O vinculo resolvido
 * fica em `req.viagemContexto` para reuso pelos services.
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

    const requisicao = contexto.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado = requisicao.user;
    const viagemId: string | undefined = requisicao.params?.viagemId;

    if (!viagemId) {
      throw new BadRequestException('Rota protegida por @NivelAcesso exige o parametro :viagemId');
    }

    const viagem = await this.prisma.viagem.findUnique({
      where: { id: viagemId },
      select: {
        id: true,
        criadoPor: true,
        membros: {
          where: { usuarioId: usuario.id },
          select: { permissao: true },
        },
      },
    });

    if (!viagem) {
      throw new NotFoundException(`Viagem ${viagemId} nao encontrada`);
    }

    const ehCriador = viagem.criadoPor === usuario.id;
    const vinculo = viagem.membros[0];
    const ehEditor = ehCriador || vinculo?.permissao === PermissaoMembro.EDITOR;
    const ehMembro = ehCriador || Boolean(vinculo);

    const autorizado =
      (nivelExigido === NivelAcessoViagem.CRIADOR && ehCriador) ||
      (nivelExigido === NivelAcessoViagem.EDITOR && ehEditor) ||
      (nivelExigido === NivelAcessoViagem.MEMBRO && ehMembro);

    if (!autorizado) {
      // RN06: nao revelamos a existencia de viagens das quais o usuario nao participa.
      if (!ehMembro) {
        throw new NotFoundException(`Viagem ${viagemId} nao encontrada`);
      }

      throw new ForbiddenException(
        nivelExigido === NivelAcessoViagem.CRIADOR
          ? 'Apenas o criador da viagem pode executar esta acao'
          : 'Seu nivel de permissao nesta viagem e somente leitura',
      );
    }

    requisicao.viagemContexto = {
      viagemId: viagem.id,
      ehCriador,
      permissao: ehCriador ? PermissaoMembro.EDITOR : vinculo?.permissao,
    };

    return true;
  }
}
