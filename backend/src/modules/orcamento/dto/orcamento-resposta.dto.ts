import { ApiProperty } from '@nestjs/swagger';

/** RF15, RF16 - orcamento da viagem. Os valores Decimal chegam como string. */
export class OrcamentoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'A3KD9F2P' })
  viagemId!: string;

  @ApiProperty({ example: '12000', description: 'Orcamento total (Decimal como string)' })
  valorTotal!: string;

  @ApiProperty({
    example: '8400',
    description: 'Soma dos custos previstos das atividades (Decimal como string)',
  })
  previstoAtividades!: string;
}
