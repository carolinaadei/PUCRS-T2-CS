import { ApiProperty } from '@nestjs/swagger';

/** Orcamento da viagem. Valores monetarios em string com duas casas. */
export class OrcamentoDto {
  @ApiProperty({ example: 'DEMO2027' })
  viagemId!: string;

  @ApiProperty({ example: '12000.00', description: 'Orcamento total' })
  valorTotal!: string;

  @ApiProperty({ example: '120.00', description: 'Soma dos custos previstos das atividades' })
  previstoAtividades!: string;

  @ApiProperty({
    example: '11880.00',
    description: 'valorTotal - previstoAtividades. Negativo quando o planejado estoura o total',
  })
  saldoDisponivel!: string;
}
