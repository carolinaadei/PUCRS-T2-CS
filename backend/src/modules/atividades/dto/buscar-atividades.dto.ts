import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** Busca no catalogo de atividades: nome, tipo, localizacao e nota minima. */
export class BuscarAtividadesDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome', example: 'Torre' })
  @IsString({ message: 'O termo de busca deve ser um texto' })
  @MaxLength(180, { message: 'O termo de busca deve ter no maximo 180 caracteres' })
  @IsOptional()
  busca?: string;

  @ApiPropertyOptional({ enum: TipoAtividade, enumName: 'TipoAtividade' })
  @IsEnum(TipoAtividade, {
    message: `Tipo de atividade invalido: use ${Object.values(TipoAtividade).join(', ')}`,
  })
  @IsOptional()
  tipoAtividade?: TipoAtividade;

  @ApiPropertyOptional({ example: 'Lisboa', description: 'Nome exato da cidade' })
  @IsString({ message: 'A cidade deve ser um texto' })
  @MaxLength(120, { message: 'A cidade deve ter no maximo 120 caracteres' })
  @IsOptional()
  cidade?: string;

  @ApiPropertyOptional({ example: 'Portugal', description: 'Nome exato do pais' })
  @IsString({ message: 'O pais deve ser um texto' })
  @MaxLength(80, { message: 'O pais deve ter no maximo 80 caracteres' })
  @IsOptional()
  pais?: string;

  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 5, description: 'Nota media minima' })
  @Type(() => Number)
  @IsNumber({}, { message: 'A nota minima deve ser um numero' })
  @Min(0, { message: 'A nota minima nao pode ser menor que 0' })
  @Max(5, { message: 'A nota minima nao pode ser maior que 5' })
  @IsOptional()
  notaMinima?: number;
}
