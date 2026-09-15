import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Bruno Lima' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsOptional()
  nome?: string;
}
