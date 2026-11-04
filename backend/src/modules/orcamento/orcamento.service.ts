import { Injectable } from '@nestjs/common';
import { Orcamento, Prisma, TipoAtividade, TipoNotificacao } from '@prisma/client';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { naoEncontrado } from '../../common/erros/erros';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { paraDinheiro } from '../../common/utils/formatos';
import { PrismaService } from '../../prisma/prisma.service';
import { travarViagem } from '../../prisma/travas';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { DefinirOrcamentoDto } from './dto/definir-orcamento.dto';
import { OrcamentoDto } from './dto/orcamento-resposta.dto';
import { GastoPorCategoriaDto, ResumoOrcamentoDto } from './dto/resumo-orcamento.dto';

/** Desempate das categorias com o mesmo total: a ordem em que o enum as declara. */
const ORDEM_DAS_CATEGORIAS = Object.values(TipoAtividade);

export const paraOrcamentoDto = (orcamento: Orcamento): OrcamentoDto => ({
  viagemId: orcamento.viagemId,
  valorTotal: paraDinheiro(orcamento.valorTotal)!,
  previstoAtividades: paraDinheiro(orcamento.previstoAtividades)!,
  saldoDisponivel: paraDinheiro(orcamento.valorTotal.minus(orcamento.previstoAtividades))!,
});

@Injectable()
export class OrcamentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Cria ou substitui o orcamento total da viagem (relacao 1:1). */
  async definir(
    viagemId: string,
    autor: UsuarioAutenticado,
    dto: DefinirOrcamentoDto,
  ): Promise<OrcamentoDto> {
    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const previstoAtividades = await this.somarCustosPrevistos(tx, viagemId);

      const orcamento = await tx.orcamento.upsert({
        where: { viagemId },
        create: { viagemId, valorTotal: dto.valorTotal, previstoAtividades },
        update: { valorTotal: dto.valorTotal, previstoAtividades },
      });

      const resposta = paraOrcamentoDto(orcamento);
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.ORCAMENTO_ATUALIZADO,
        mensagem: (nomeViagem) =>
          `${autor.nome} definiu o orcamento de ${nomeViagem} em ${resposta.valorTotal}`,
      });

      return resposta;
    });
  }

  async buscar(viagemId: string): Promise<OrcamentoDto> {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { viagemId } });

    if (!orcamento) {
      throw naoEncontrado(
        CodigoErro.ORCAMENTO_NAO_DEFINIDO,
        'Esta viagem ainda nao tem orcamento definido',
      );
    }

    return paraOrcamentoDto(orcamento);
  }

  /**
   * Apaga o orcamento da viagem. Os custos previstos ficam nas atividades,
   * entao voltam a contar se um novo orcamento for definido.
   */
  async remover(viagemId: string, autor: UsuarioAutenticado): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.orcamento.deleteMany({ where: { viagemId } });

      if (count === 0) {
        throw naoEncontrado(
          CodigoErro.ORCAMENTO_NAO_DEFINIDO,
          'Esta viagem ainda nao tem orcamento definido',
        );
      }

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.ORCAMENTO_REMOVIDO,
        mensagem: (nomeViagem) => `${autor.nome} removeu o orcamento de ${nomeViagem}`,
      });
    });
  }

  /**
   * Mantem `previsto_atividades` igual a soma dos custos das atividades. Recebe
   * o cliente da transacao de quem alterou os custos, que ja travou a viagem:
   * a soma enxerga a alteracao e nenhuma outra escrita concorrente se mistura.
   */
  async recalcularPrevisto(tx: Prisma.TransactionClient, viagemId: string): Promise<void> {
    const total = await this.somarCustosPrevistos(tx, viagemId);

    await tx.orcamento.updateMany({
      where: { viagemId },
      data: { previstoAtividades: total },
    });
  }

  /**
   * Resumo financeiro. As contas sao feitas em Decimal, como no banco: somar
   * centavos em ponto flutuante acumula erro.
   */
  async resumir(viagemId: string): Promise<ResumoOrcamentoDto> {
    const [orcamento, atividades] = await Promise.all([
      this.prisma.orcamento.findUnique({ where: { viagemId } }),
      this.prisma.atividadeViagem.findMany({
        where: { destinoViagem: { viagemId }, custoPrevisto: { not: null } },
        select: {
          custoPrevisto: true,
          catalogoAtividade: { select: { tipoAtividade: true } },
        },
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const orcamentoTotal = orcamento?.valorTotal ?? zero;
    const totaisPorTipo = new Map<TipoAtividade, Prisma.Decimal>();
    let totalPlanejado = zero;

    for (const { custoPrevisto, catalogoAtividade } of atividades) {
      const custo = custoPrevisto ?? zero;
      const tipo = catalogoAtividade.tipoAtividade;

      totalPlanejado = totalPlanejado.plus(custo);
      totaisPorTipo.set(tipo, (totaisPorTipo.get(tipo) ?? zero).plus(custo));
    }

    const porCategoria: GastoPorCategoriaDto[] = Array.from(totaisPorTipo)
      .sort(
        ([tipoA, totalA], [tipoB, totalB]) =>
          totalB.comparedTo(totalA) ||
          ORDEM_DAS_CATEGORIAS.indexOf(tipoA) - ORDEM_DAS_CATEGORIAS.indexOf(tipoB),
      )
      .map(([tipoAtividade, total]) => ({
        tipoAtividade,
        total: paraDinheiro(total)!,
        percentual: this.percentual(total, orcamentoTotal),
      }));

    return {
      orcamentoDefinido: orcamento !== null,
      orcamentoTotal: paraDinheiro(orcamentoTotal)!,
      totalPlanejado: paraDinheiro(totalPlanejado)!,
      saldoDisponivel: paraDinheiro(orcamentoTotal.minus(totalPlanejado))!,
      percentualConsumido: this.percentual(totalPlanejado, orcamentoTotal),
      porCategoria,
    };
  }

  private async somarCustosPrevistos(
    tx: Prisma.TransactionClient,
    viagemId: string,
  ): Promise<Prisma.Decimal> {
    const agregado = await tx.atividadeViagem.aggregate({
      where: { destinoViagem: { viagemId } },
      _sum: { custoPrevisto: true },
    });

    return agregado._sum.custoPrevisto ?? new Prisma.Decimal(0);
  }

  /** `parte` sobre `total`, em % com duas casas. Sem orcamento nao ha base: fica em 0. */
  private percentual(parte: Prisma.Decimal, total: Prisma.Decimal): number {
    if (total.isZero()) {
      return 0;
    }

    return parte.div(total).times(100).toDecimalPlaces(2).toNumber();
  }
}
