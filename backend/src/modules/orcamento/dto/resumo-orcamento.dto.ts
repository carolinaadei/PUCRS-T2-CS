import { ApiProperty } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';

export class GastoPorCategoriaDto {
  @ApiProperty({ enum: TipoAtividade, enumName: 'TipoAtividade', example: TipoAtividade.PASSEIO })
  tipoAtividade!: TipoAtividade;

  @ApiProperty({ example: '120.00', description: 'Soma dos custos previstos da categoria' })
  total!: string;

  @ApiProperty({
    example: 1,
    description: 'Quanto a categoria consome do orcamento total, em %. 0 sem orcamento definido',
  })
  percentual!: number;
}

/** Painel de resumo financeiro da viagem. */
export class ResumoOrcamentoDto {
  @ApiProperty({
    example: true,
    description:
      'false enquanto a viagem nao tiver orcamento: orcamentoTotal e percentuais ficam em 0; ' +
      'totalPlanejado continua somando os custos das atividades',
  })
  orcamentoDefinido!: boolean;

  @ApiProperty({ example: '12000.00' })
  orcamentoTotal!: string;

  @ApiProperty({ example: '120.00', description: 'Soma dos custos previstos das atividades' })
  totalPlanejado!: string;

  @ApiProperty({
    example: '11880.00',
    description:
      'orcamentoTotal - totalPlanejado. Pode ser negativo inclusive sem orcamento definido',
  })
  saldoDisponivel!: string;

  @ApiProperty({
    example: 1,
    description: 'Percentual do orcamento ja comprometido. Passa de 100 se o orcamento estourar',
  })
  percentualConsumido!: number;

  @ApiProperty({
    type: [GastoPorCategoriaDto],
    description: 'So as categorias com custo previsto, da mais cara para a mais barata',
  })
  porCategoria!: GastoPorCategoriaDto[];
}
