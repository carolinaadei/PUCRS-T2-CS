import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PermissaoMembro } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacoesService, TipoNotificacao } from '../notificacoes/notificacoes.service';

@Injectable()
export class MembrosService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notificacoesService?: NotificacoesService,
  ) {}

  /** Entrar em uma viagem usando o codigo de convite. */
  async entrar(viagemId: string, usuarioId: number) {
    const codigo = viagemId.trim().toUpperCase();
    const viagem = await this.prisma.viagem.findUnique({
      where: { id: codigo },
      select: { id: true, criadoPor: true },
    });

    if (!viagem) {
      throw new NotFoundException('Codigo de convite invalido');
    }

    if (viagem.criadoPor === usuarioId) {
      throw new ConflictException('Voce e o criador desta viagem');
    }

    const jaEhMembro = await this.prisma.membroViagem.findUnique({
      where: { viagemId_usuarioId: { viagemId: viagem.id, usuarioId } },
      select: { id: true },
    });

    if (jaEhMembro) {
      throw new ConflictException('Voce ja participa desta viagem');
    }

    // Quem entra pelo codigo comeca como VISUALIZADOR;
    // o criador promove a EDITOR quando quiser.
    const membro = await this.prisma.membroViagem.create({
      data: { viagemId: viagem.id, usuarioId, permissao: PermissaoMembro.VISUALIZADOR },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });

    const nomeUsuario = membro?.usuario?.nome ?? 'Um novo colaborador';
    await this.notificacoesService?.notificarAlteracaoViagem({
      viagemId: viagem.id,
      autorId: usuarioId,
      tipo: TipoNotificacao.MEMBRO_ENTROU,
      mensagem: `${nomeUsuario} entrou na viagem como colaborador`,
      destinatariosExtras: [viagem.criadoPor],
    });

    return membro;
  }

  /** Lista colaboradores da viagem (visivel a qualquer membro). */
  listar(viagemId: string) {
    return this.prisma.membroViagem.findMany({
      where: { viagemId },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
      orderBy: { entrouEm: 'asc' },
    });
  }

  /** O criador altera a permissao de um colaborador. */
  async definirPermissao(viagemId: string, membroId: number, permissao: PermissaoMembro) {
    await this.garantirMembroDaViagem(viagemId, membroId);

    const atualizado = await this.prisma.membroViagem.update({
      where: { id: membroId },
      data: { permissao },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });

    if (typeof atualizado?.usuarioId === 'number') {
      this.notificacoesService?.registrarParaUsuarios([atualizado.usuarioId], {
        viagemId,
        tipo: TipoNotificacao.PERMISSAO_ALTERADA,
        mensagem: `Sua permissao na viagem ${viagemId} foi alterada para ${permissao}`,
      });
    }

    return atualizado;
  }

  /** O criador remove um colaborador. */
  async remover(viagemId: string, membroId: number) {
    const vinculo = await this.garantirMembroDaViagem(viagemId, membroId);
    await this.prisma.membroViagem.delete({ where: { id: membroId } });

    if (typeof vinculo.usuarioId === 'number') {
      this.notificacoesService?.registrarParaUsuarios([vinculo.usuarioId], {
        viagemId,
        tipo: TipoNotificacao.MEMBRO_REMOVIDO,
        mensagem: `Voce foi removido da viagem ${viagemId}`,
      });
    }
  }

  /** Um colaborador pode sair da viagem por conta propria. */
  async sair(viagemId: string, usuarioId: number) {
    const vinculo = await this.prisma.membroViagem.findUnique({
      where: { viagemId_usuarioId: { viagemId, usuarioId } },
      select: { id: true, viagem: { select: { criadoPor: true } } },
    });

    if (!vinculo) {
      throw new BadRequestException('O criador da viagem nao pode sair dela; exclua a viagem');
    }

    await this.prisma.membroViagem.delete({ where: { id: vinculo.id } });

    await this.notificacoesService?.notificarAlteracaoViagem({
      viagemId,
      autorId: usuarioId,
      tipo: TipoNotificacao.MEMBRO_SAIU,
      mensagem: `Um colaborador saiu da viagem ${viagemId}`,
      destinatariosExtras:
        typeof vinculo.viagem?.criadoPor === 'number' ? [vinculo.viagem.criadoPor] : [],
    });
  }

  /** Impede manipular um vinculo que pertence a outra viagem. */
  private async garantirMembroDaViagem(viagemId: string, membroId: number) {
    const vinculo = await this.prisma.membroViagem.findUnique({
      where: { id: membroId },
      select: { viagemId: true, usuarioId: true },
    });

    if (!vinculo || vinculo.viagemId !== viagemId) {
      throw new NotFoundException('Colaborador nao encontrado nesta viagem');
    }

    return vinculo;
  }
}
