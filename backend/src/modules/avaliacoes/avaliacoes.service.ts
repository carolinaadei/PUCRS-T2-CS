import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CriarAvaliacaoDto } from './dto/criar-avaliacao.dto';

/**
 * Servico responsavel pelas regras de negocio do Modulo 7 (Avaliacao e Descoberta de Atividades).
 * Implementa a criacao, atualizacao, consulta e remocao de avaliacoes (RF22 e RF23),
 * mantendo consistente a media de notas do catalogo de atividades (RN01, RN05).
 */
@Injectable()
export class AvaliacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RF23, RN01 - Lista todas as avaliacoes registradas para uma atividade do catalogo.
   * As avaliacoes sao publicas e ordenadas a partir da mais recente.
   * @param catalogoAtividadeId Identificador da atividade no catalogo.
   * @throws NotFoundException Se a atividade nao existir no catalogo.
   * @returns Lista de avaliacoes com os dados publicos dos respectivos autores.
   */
  async listarDaAtividade(catalogoAtividadeId: number) {
    await this.garantirAtividadeNoCatalogo(catalogoAtividadeId);

    return this.prisma.avaliacao.findMany({
      where: { catalogoAtividadeId },
      include: { usuario: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'desc' },
    });
  }

  /**
   * RF22, RN05 - Registra ou atualiza a avaliacao de uma atividade por um usuario autenticado.
   * Cada usuario possui no maximo uma avaliacao por atividade; se ja tiver avaliado,
   * a nota e o comentario sao atualizados (upsert). A media da atividade e recalculada.
   * @param usuarioId Identificador do usuario autenticado que esta avaliando.
   * @param catalogoAtividadeId Identificador da atividade no catalogo.
   * @param dto Dados contendo nota (1 a 5) e comentario opcional.
   * @throws NotFoundException Se a atividade informada nao existir no catalogo.
   * @returns Registro da avaliacao com os dados do autor.
   */
  async avaliar(usuarioId: number, catalogoAtividadeId: number, dto: CriarAvaliacaoDto) {
    await this.garantirAtividadeNoCatalogo(catalogoAtividadeId);

    const comentario = dto.comentario?.trim() || null;

    const avaliacao = await this.prisma.avaliacao.upsert({
      where: { usuarioId_catalogoAtividadeId: { usuarioId, catalogoAtividadeId } },
      create: {
        usuarioId,
        catalogoAtividadeId,
        nota: dto.nota,
        comentario,
      },
      update: {
        nota: dto.nota,
        comentario,
      },
      include: { usuario: { select: { id: true, nome: true } } },
    });

    await this.recalcularMedia(catalogoAtividadeId);

    return avaliacao;
  }

  /**
   * RF22 - Remove uma avaliacao existente. Apenas o proprio autor pode remove-la.
   * Apos a remocao, a media de avaliacoes da atividade e recalculada automaticamente.
   * @param usuarioId Identificador do usuario autenticado solicitando a remocao.
   * @param avaliacaoId Identificador da avaliacao a ser excluida.
   * @throws NotFoundException Se a avaliacao nao for encontrada.
   * @throws ForbiddenException Se o usuario nao for o autor da avaliacao.
   */
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

  /**
   * Mantem o campo derivado `media_avaliacao` da tabela `catalogo_atividade` sincronizado
   * a cada escrita (criacao, atualizacao ou exclusao de avaliacoes), usado nos filtros do RF24
   * e destaques do RF25.
   * @param catalogoAtividadeId Identificador da atividade a ter a media atualizada.
   */
  private async recalcularMedia(catalogoAtividadeId: number): Promise<void> {
    const agregado = await this.prisma.avaliacao.aggregate({
      where: { catalogoAtividadeId },
      _avg: { nota: true },
    });

    const media = agregado._avg.nota ? Math.round(agregado._avg.nota * 10) / 10 : 0;

    await this.prisma.catalogoAtividade.update({
      where: { id: catalogoAtividadeId },
      data: { mediaAvaliacao: media },
    });
  }

  /**
   * Verifica se a atividade informada existe no catalogo global antes de criar ou listar avaliacoes.
   * @param catalogoAtividadeId Identificador da atividade a ser verificada.
   * @throws NotFoundException Se a atividade nao for encontrada.
   */
  private async garantirAtividadeNoCatalogo(catalogoAtividadeId: number): Promise<void> {
    const atividade = await this.prisma.catalogoAtividade.findUnique({
      where: { id: catalogoAtividadeId },
      select: { id: true },
    });

    if (!atividade) {
      throw new NotFoundException('Atividade nao encontrada no catalogo');
    }
  }
}
