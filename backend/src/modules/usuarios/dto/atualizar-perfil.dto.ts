import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Bruno Lima' })
  @IsString({ message: 'O nome deve ser um texto' })
  @MinLength(2, { message: 'O nome deve ter no minimo 2 caracteres' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  @IsOptional()
  nome?: string;
}
