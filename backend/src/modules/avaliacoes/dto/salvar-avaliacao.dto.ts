import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Nota de 1 a 5 estrelas e comentario opcional. */
export class SalvarAvaliacaoDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Nota inteira de 1 a 5' })
  @IsInt({ message: 'A nota deve ser um numero inteiro' })
  @Min(1, { message: 'A nota deve ser de 1 a 5' })
  @Max(5, { message: 'A nota deve ser de 1 a 5' })
  nota!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Vale a pena chegar cedo para evitar a fila.',
    maxLength: 2000,
  })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString({ message: 'O comentario deve ser um texto' })
  @MaxLength(2000, { message: 'O comentario deve ter no maximo 2000 caracteres' })
  @IsOptional()
  comentario?: string | null;
}
