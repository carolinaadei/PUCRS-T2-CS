import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CriarAvaliacaoDto } from './dto/criar-avaliacao.dto';

@Injectable()
export class AvaliacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** RF23, RN01 - reviews visiveis publicamente. */
  listarDaAtividade(catalogoAtividadeId: number) {
    return this.prisma.avaliacao.findMany({
      where: { catalogoAtividadeId },
      include: { usuario: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'desc' },
    });
  }

  /**
   * RF22, RN05 - cria ou atualiza a avaliacao do usuario para a atividade.
   * Um usuario tem no maximo uma avaliacao por atividade (unique no schema).
   */
  async avaliar(usuarioId: number, catalogoAtividadeId: number, dto: CriarAvaliacaoDto) {
    const atividade = await this.prisma.catalogoAtividade.findUnique({
      where: { id: catalogoAtividadeId },
      select: { id: true },
    });

    if (!atividade) {
      throw new NotFoundException('Atividade nao encontrada no catalogo');
    }

    const avaliacao = await this.prisma.avaliacao.upsert({
      where: { usuarioId_catalogoAtividadeId: { usuarioId, catalogoAtividadeId } },
      create: { usuarioId, catalogoAtividadeId, nota: dto.nota, comentario: dto.comentario },
      update: { nota: dto.nota, comentario: dto.comentario },
      include: { usuario: { select: { id: true, nome: true } } },
    });

    await this.recalcularMedia(catalogoAtividadeId);

    return avaliacao;
  }

  /** O autor pode remover a propria avaliacao. */
  async remover(usuarioId: number, avaliacaoId: number) {
    const avaliacao = await this.prisma.avaliacao.findUnique({
      where: { id: avaliacaoId },
      select: { usuarioId: true, catalogoAtividadeId: true },
    });

    if (!avaliacao) {
      throw new NotFoundException('Avaliacao nao encontrada');
    }

    if (avaliacao.usuarioId !== usuarioId) {
      throw new ForbiddenException('Voce so pode remover as suas proprias avaliacoes');
    }

    await this.prisma.avaliacao.delete({ where: { id: avaliacaoId } });
    await this.recalcularMedia(avaliacao.catalogoAtividadeId);
  }

  /** Mantem `media_avaliacao` do catalogo consistente (usada nos filtros do RF24). */
  private async recalcularMedia(catalogoAtividadeId: number): Promise<void> {
    const agregado = await this.prisma.avaliacao.aggregate({
      where: { catalogoAtividadeId },
      _avg: { nota: true },
    });

    await this.prisma.catalogoAtividade.update({
      where: { id: catalogoAtividadeId },
      data: { mediaAvaliacao: agregado._avg.nota ?? 0 },
    });
  }
}
