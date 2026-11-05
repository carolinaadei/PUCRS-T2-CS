import { Injectable } from '@nestjs/common';
import { Prisma, StatusAtividade, StatusViagem } from '@prisma/client';
import { PaginacaoDto, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { naoEncontrado, proibido } from '../../common/erros/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { travarAtividadeCatalogo } from '../../prisma/travas';
import { INCLUIR_AUTOR, paraAvaliacaoDto } from './avaliacoes.mapper';
import { AvaliacaoDto } from './dto/avaliacao-resposta.dto';
import { SalvarAvaliacaoDto } from './dto/salvar-avaliacao.dto';

type Tx = Prisma.TransactionClient;

/**
 * Avaliacoes de atividades. Cada usuario tem no maximo uma por atividade, e a
 * media do catalogo (campo derivado, usado no filtro de nota e nos destaques) e
 * recalculada na mesma transacao, com a atividade travada.
 */
@Injectable()
export class AvaliacoesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Avaliacoes publicas da atividade, mais recentes primeiro. */
  async listarDaAtividade(catalogoAtividadeId: number, paginacao: PaginacaoDto) {
    await this.garantirAtividade(this.prisma, catalogoAtividadeId);

    const where = { catalogoAtividadeId };
    const [itens, total] = await this.prisma.$transaction([
      this.prisma.avaliacao.findMany({
        where,
        include: INCLUIR_AUTOR,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: paginacao.pular,
        take: paginacao.limite,
      }),
      this.prisma.avaliacao.count({ where }),
    ]);

    return new RespostaPaginada(itens.map(paraAvaliacaoDto), total, paginacao);
  }

  async buscarMinha(usuarioId: number, catalogoAtividadeId: number): Promise<AvaliacaoDto> {
    await this.garantirAtividade(this.prisma, catalogoAtividadeId);

    const avaliacao = await this.prisma.avaliacao.findUnique({
      where: { usuarioId_catalogoAtividadeId: { usuarioId, catalogoAtividadeId } },
      include: INCLUIR_AUTOR,
    });

    if (!avaliacao) {
      throw this.semAvaliacao();
    }

    return paraAvaliacaoDto(avaliacao);
  }

  /**
   * Cria ou substitui a avaliacao do usuario. So avalia quem fez: a atividade
   * precisa estar CONCLUIDA (ou numa viagem CONCLUIDA) numa viagem de que o
   * usuario participa.
   */
  async salvarMinha(
    usuarioId: number,
    catalogoAtividadeId: number,
    dto: SalvarAvaliacaoDto,
  ): Promise<{ avaliacao: AvaliacaoDto; criada: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.garantirAtividade(tx, catalogoAtividadeId);
      await travarAtividadeCatalogo(tx, catalogoAtividadeId);
      await this.garantirQueRealizou(tx, usuarioId, catalogoAtividadeId);

      const chave = { usuarioId_catalogoAtividadeId: { usuarioId, catalogoAtividadeId } };
      const existente = await tx.avaliacao.findUnique({ where: chave, select: { id: true } });
      const dados = { nota: dto.nota, comentario: dto.comentario ?? null };

      const avaliacao = await tx.avaliacao.upsert({
        where: chave,
        create: { usuarioId, catalogoAtividadeId, ...dados },
        update: dados,
        include: INCLUIR_AUTOR,
      });

      await this.recalcularMedia(tx, catalogoAtividadeId);

      return { avaliacao: paraAvaliacaoDto(avaliacao), criada: !existente };
    });
  }

  async removerMinha(usuarioId: number, catalogoAtividadeId: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.garantirAtividade(tx, catalogoAtividadeId);
      await travarAtividadeCatalogo(tx, catalogoAtividadeId);

      const { count } = await tx.avaliacao.deleteMany({
        where: { usuarioId, catalogoAtividadeId },
      });
      if (count === 0) {
        throw this.semAvaliacao();
      }

      await this.recalcularMedia(tx, catalogoAtividadeId);
    });
  }

  private semAvaliacao() {
    return naoEncontrado(
      CodigoErro.AVALIACAO_NAO_ENCONTRADA,
      'Voce ainda nao avaliou esta atividade',
    );
  }

  private async garantirAtividade(tx: Tx, catalogoAtividadeId: number) {
    const atividade = await tx.catalogoAtividade.findUnique({
      where: { id: catalogoAtividadeId },
      select: { id: true },
    });

    if (!atividade) {
      throw naoEncontrado(
        CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA,
        'Atividade nao encontrada no catalogo',
      );
    }
  }

  private async garantirQueRealizou(tx: Tx, usuarioId: number, catalogoAtividadeId: number) {
    const realizacoes = await tx.atividadeViagem.count({
      where: {
        catalogoAtividadeId,
        AND: [
          {
            destinoViagem: {
              viagem: { OR: [{ criadoPor: usuarioId }, { membros: { some: { usuarioId } } }] },
            },
          },
          {
            OR: [
              { status: StatusAtividade.CONCLUIDA },
              { destinoViagem: { viagem: { status: StatusViagem.CONCLUIDA } } },
            ],
          },
        ],
      },
    });

    if (realizacoes === 0) {
      throw proibido(
        CodigoErro.ATIVIDADE_NAO_REALIZADA,
        'So e possivel avaliar uma atividade concluida numa viagem de que voce participa',
      );
    }
  }

  /** Media com uma casa decimal; 0 quando a atividade fica sem avaliacoes. */
  private async recalcularMedia(tx: Tx, catalogoAtividadeId: number): Promise<void> {
    const { _avg } = await tx.avaliacao.aggregate({
      where: { catalogoAtividadeId },
      _avg: { nota: true },
    });

    await tx.catalogoAtividade.update({
      where: { id: catalogoAtividadeId },
      data: { mediaAvaliacao: _avg.nota ? Math.round(_avg.nota * 10) / 10 : 0 },
    });
  }
}
