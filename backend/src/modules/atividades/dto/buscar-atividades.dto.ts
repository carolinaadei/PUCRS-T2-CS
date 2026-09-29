import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** RF24 - catalogo de atividades com busca por nome e filtros. */
export class BuscarAtividadesDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Busca por nome', example: 'Torre de Belem' })
  @IsString()
  @IsOptional()
  busca?: string;

  @ApiPropertyOptional({ enum: TipoAtividade })
  @IsEnum(TipoAtividade)
  @IsOptional()
  tipoAtividade?: TipoAtividade;

  @ApiPropertyOptional({ example: 'Lisboa' })
  @IsString()
  @IsOptional()
  cidade?: string;

  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString()
  @IsOptional()
  pais?: string;

  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 5, description: 'Nota media minima' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  @IsOptional()
  notaMinima?: number;
}
