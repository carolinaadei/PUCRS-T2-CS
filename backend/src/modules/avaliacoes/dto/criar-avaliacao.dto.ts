import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** RF22 - nota de 1 a 5 estrelas e comentario opcional. */
export class CriarAvaliacaoDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1, { message: 'A nota deve ser de 1 a 5' })
  @Max(5, { message: 'A nota deve ser de 1 a 5' })
  nota!: number;

  @ApiPropertyOptional({ example: 'Vale a pena chegar cedo para evitar a fila.' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comentario?: string;
}
