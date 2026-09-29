import { ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaDestino } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** RF10 - pesquisar destinos ja cadastrados na plataforma. */
export class BuscarDestinosDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Busca por nome da cidade', example: 'Lisboa' })
  @IsString()
  @IsOptional()
  busca?: string;

  @ApiPropertyOptional({ enum: CategoriaDestino })
  @IsEnum(CategoriaDestino)
  @IsOptional()
  categoria?: CategoriaDestino;

  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString()
  @IsOptional()
  pais?: string;
}
