import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * RF22 - DTO de entrada para avaliacao de uma atividade por um usuario autenticado (RN05).
 * Permite atribuir nota inteira de 1 a 5 estrelas e um comentario opcional de ate 2000 caracteres.
 */
export class CriarAvaliacaoDto {
  /** Nota inteira atribuida a atividade, entre 1 e 5 estrelas (obrigatorio). */
  @ApiProperty({
    example: 5,
    minimum: 1,
    maximum: 5,
    description: 'Nota inteira de 1 a 5 estrelas',
  })
  @IsInt({ message: 'A nota deve ser um numero inteiro' })
  @Min(1, { message: 'A nota deve ser de 1 a 5' })
  @Max(5, { message: 'A nota deve ser de 1 a 5' })
  nota!: number;

  /** Comentario descritivo ou review sobre a experiencia na atividade (opcional, ate 2000 caracteres). */
  @ApiPropertyOptional({
    example: 'Vale a pena chegar cedo para evitar a fila.',
    description: 'Comentario opcional sobre a atividade',
    maxLength: 2000,
  })
  @IsString({ message: 'O comentario deve ser um texto' })
  @IsOptional()
  @MaxLength(2000, { message: 'O comentario deve ter no maximo 2000 caracteres' })
  comentario?: string;
}
