import { ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaDestino } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** Pesquisa no catalogo de destinos. */
export class BuscarDestinosDto extends PaginacaoDto {
  @ApiPropertyOptional({ description: 'Parte do nome da cidade', example: 'Lis' })
  @IsString({ message: 'O termo de busca deve ser um texto' })
  @MaxLength(120, { message: 'O termo de busca deve ter no maximo 120 caracteres' })
  @IsOptional()
  busca?: string;

  @ApiPropertyOptional({ enum: CategoriaDestino, enumName: 'CategoriaDestino' })
  @IsEnum(CategoriaDestino, {
    message: `Categoria invalida: use ${Object.values(CategoriaDestino).join(', ')}`,
  })
  @IsOptional()
  categoria?: CategoriaDestino;

  @ApiPropertyOptional({ example: 'Portugal', description: 'Nome exato do pais' })
  @IsString({ message: 'O pais deve ser um texto' })
  @MaxLength(80, { message: 'O pais deve ter no maximo 80 caracteres' })
  @IsOptional()
  pais?: string;
}
