import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

/** RF15 - definir o orcamento total da viagem. */
export class DefinirOrcamentoDto {
  @ApiProperty({ example: 12000.0, description: 'Orcamento total previsto para a viagem' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valorTotal!: number;
}
