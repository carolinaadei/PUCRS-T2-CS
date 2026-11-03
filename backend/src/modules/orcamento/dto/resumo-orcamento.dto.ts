import { ApiProperty } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';

export class GastoPorCategoriaDto {
  @ApiProperty({ enum: TipoAtividade, example: TipoAtividade.HOSPEDAGEM })
  tipoAtividade!: TipoAtividade;

  @ApiProperty({ example: 3200.0, description: 'Soma dos custos previstos da categoria' })
  total!: number;

  @ApiProperty({
    example: 26.67,
    description: 'Quanto a categoria consome do orcamento total, em %. 0 sem orcamento definido',
  })
  percentual!: number;
}

/** RF17 - painel de resumo financeiro. */
export class ResumoOrcamentoDto {
  @ApiProperty({
    example: true,
    description: 'false enquanto a viagem nao tiver orcamento: total e percentuais ficam em 0',
  })
  orcamentoDefinido!: boolean;

  @ApiProperty({ example: 12000.0 })
  orcamentoTotal!: number;

  @ApiProperty({ example: 8400.0, description: 'Soma dos custos previstos das atividades' })
  totalPlanejado!: number;

  @ApiProperty({
    example: 3600.0,
    description: 'orcamentoTotal - totalPlanejado. Negativo quando o planejado passa do orcamento',
  })
  saldoDisponivel!: number;

  @ApiProperty({
    example: 70,
    description: 'Percentual do orcamento ja comprometido. Passa de 100 se o orcamento estourar',
  })
  percentualConsumido!: number;

  @ApiProperty({
    type: [GastoPorCategoriaDto],
    description: 'So as categorias com custo previsto, da mais cara para a mais barata',
  })
  porCategoria!: GastoPorCategoriaDto[];
}
