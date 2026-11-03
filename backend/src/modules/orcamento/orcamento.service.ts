import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TipoAtividade } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DefinirOrcamentoDto } from './dto/definir-orcamento.dto';
import { GastoPorCategoriaDto, ResumoOrcamentoDto } from './dto/resumo-orcamento.dto';

const SEM_ORCAMENTO = 'Esta viagem ainda nao tem orcamento definido';

/** Desempate das categorias com o mesmo total: a ordem em que o enum as declara. */
const ORDEM_DAS_CATEGORIAS = Object.values(TipoAtividade);

@Injectable()
export class OrcamentoService {
  constructor(private readonly prisma: PrismaService) {}

  /** RF15 - cria ou substitui o orcamento total da viagem (relacao 1:1). */
  async definir(viagemId: string, dto: DefinirOrcamentoDto) {
    const previstoAtividades = await this.somarCustosPrevistos(viagemId);

    return this.prisma.orcamento.upsert({
      where: { viagemId },
      create: { viagemId, valorTotal: dto.valorTotal, previstoAtividades },
      update: { valorTotal: dto.valorTotal, previstoAtividades },
    });
  }

  async buscar(viagemId: string) {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { viagemId } });

    if (!orcamento) {
      throw new NotFoundException(SEM_ORCAMENTO);
    }

    return orcamento;
  }

  /**
   * RN02 - apaga o orcamento da viagem. Os custos previstos ficam nas
   * atividades, entao voltam a contar se um novo orcamento for definido.
   */
  async remover(viagemId: string): Promise<void> {
    const { count } = await this.prisma.orcamento.deleteMany({ where: { viagemId } });

    if (count === 0) {
      throw new NotFoundException(SEM_ORCAMENTO);
    }
  }

  /**
   * RF16 - mantem `previsto_atividades` sincronizado com a soma dos custos
   * das atividades. Chamado pelos services de atividades e de destinos a cada
   * alteracao que mexe nesses custos.
   * Sem orcamento definido a viagem simplesmente nao tem o que atualizar.
   */
  async recalcularPrevisto(viagemId: string): Promise<void> {
    const total = await this.somarCustosPrevistos(viagemId);

    await this.prisma.orcamento.updateMany({
      where: { viagemId },
      data: { previstoAtividades: total },
    });
  }

  /**
   * RF17 - painel de resumo financeiro da viagem. As contas sao feitas em
   * Decimal, como no banco: somar centavos em ponto flutuante acumula erro.
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

    const orcamentoTotal = orcamento?.valorTotal ?? new Prisma.Decimal(0);
    const totaisPorTipo = new Map<TipoAtividade, Prisma.Decimal>();
    let totalPlanejado = new Prisma.Decimal(0);

    for (const { custoPrevisto, catalogoAtividade } of atividades) {
      const custo = custoPrevisto ?? new Prisma.Decimal(0);
      const tipo = catalogoAtividade.tipoAtividade;

      totalPlanejado = totalPlanejado.plus(custo);
      totaisPorTipo.set(tipo, (totaisPorTipo.get(tipo) ?? new Prisma.Decimal(0)).plus(custo));
    }

    const porCategoria: GastoPorCategoriaDto[] = Array.from(
      totaisPorTipo,
      ([tipoAtividade, total]) => ({
        tipoAtividade,
        total: total.toNumber(),
        percentual: this.percentual(total, orcamentoTotal),
      }),
    ).sort(
      (a, b) =>
        b.total - a.total ||
        ORDEM_DAS_CATEGORIAS.indexOf(a.tipoAtividade) -
          ORDEM_DAS_CATEGORIAS.indexOf(b.tipoAtividade),
    );

    return {
      orcamentoDefinido: orcamento !== null,
      orcamentoTotal: orcamentoTotal.toNumber(),
      totalPlanejado: totalPlanejado.toNumber(),
      saldoDisponivel: orcamentoTotal.minus(totalPlanejado).toNumber(),
      percentualConsumido: this.percentual(totalPlanejado, orcamentoTotal),
      porCategoria,
    };
  }

  private async somarCustosPrevistos(viagemId: string): Promise<Prisma.Decimal> {
    const agregado = await this.prisma.atividadeViagem.aggregate({
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
