import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DefinirOrcamentoDto } from './dto/definir-orcamento.dto';
import { GastoPorCategoriaDto, ResumoOrcamentoDto } from './dto/resumo-orcamento.dto';

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
      throw new NotFoundException('Esta viagem ainda nao tem orcamento definido');
    }

    return orcamento;
  }

  /**
   * RF16 - mantem `previsto_atividades` sincronizado com a soma dos custos
   * das atividades. Chamado pelo AtividadesService a cada alteracao.
   * Sem orcamento definido a viagem simplesmente nao tem o que atualizar.
   */
  async recalcularPrevisto(viagemId: string): Promise<void> {
    const total = await this.somarCustosPrevistos(viagemId);

    await this.prisma.orcamento.updateMany({
      where: { viagemId },
      data: { previstoAtividades: total },
    });
  }

  /** RF17 - painel de resumo financeiro da viagem. */
  async resumir(viagemId: string): Promise<ResumoOrcamentoDto> {
    const orcamento = await this.prisma.orcamento.findUnique({ where: { viagemId } });
    const orcamentoTotal = Number(orcamento?.valorTotal ?? 0);

    const atividades = await this.prisma.atividadeViagem.findMany({
      where: { destinoViagem: { viagemId }, custoPrevisto: { not: null } },
      select: {
        custoPrevisto: true,
        catalogoAtividade: { select: { tipoAtividade: true } },
      },
    });

    const totaisPorTipo = new Map<string, number>();
    let totalPlanejado = 0;

    for (const atividade of atividades) {
      const custo = Number(atividade.custoPrevisto ?? 0);
      const tipo = atividade.catalogoAtividade.tipoAtividade;

      totalPlanejado += custo;
      totaisPorTipo.set(tipo, (totaisPorTipo.get(tipo) ?? 0) + custo);
    }

    const porCategoria: GastoPorCategoriaDto[] = Array.from(totaisPorTipo.entries())
      .map(([tipoAtividade, total]) => ({
        tipoAtividade: tipoAtividade as GastoPorCategoriaDto['tipoAtividade'],
        total: this.arredondar(total),
        // Sem orcamento definido nao ha base de comparacao: o percentual fica em 0.
        percentual: orcamentoTotal > 0 ? this.arredondar((total / orcamentoTotal) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return {
      orcamentoTotal: this.arredondar(orcamentoTotal),
      totalPlanejado: this.arredondar(totalPlanejado),
      saldoDisponivel: this.arredondar(orcamentoTotal - totalPlanejado),
      percentualConsumido:
        orcamentoTotal > 0 ? this.arredondar((totalPlanejado / orcamentoTotal) * 100) : 0,
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

  private arredondar(valor: number): number {
    return Math.round(valor * 100) / 100;
  }
}
