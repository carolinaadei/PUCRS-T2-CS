import { ApiProperty } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';

export class GastoPorCategoriaDto {
  @ApiProperty({ enum: TipoAtividade })
  tipoAtividade!: TipoAtividade;

  @ApiProperty({ example: 3200.0 })
  total!: number;

  @ApiProperty({ example: 26.67, description: 'Percentual sobre o orcamento total' })
  percentual!: number;
}

/** RF17 - painel de resumo financeiro. */
export class ResumoOrcamentoDto {
  @ApiProperty({ example: 12000.0 })
  orcamentoTotal!: number;

  @ApiProperty({ example: 8400.0, description: 'Soma dos custos previstos das atividades' })
  totalPlanejado!: number;

  @ApiProperty({ example: 3600.0, description: 'orcamentoTotal - totalPlanejado' })
  saldoDisponivel!: number;

  @ApiProperty({ example: 70, description: 'Percentual do orcamento ja comprometido' })
  percentualConsumido!: number;

  @ApiProperty({ type: [GastoPorCategoriaDto] })
  porCategoria!: GastoPorCategoriaDto[];
}
