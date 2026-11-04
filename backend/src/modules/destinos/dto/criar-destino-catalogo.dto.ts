import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoriaDestino } from '@prisma/client';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

/** RF09 - cada destino do catalogo representa uma cidade. */
export class CriarDestinoCatalogoDto {
  @ApiProperty({ example: 'Porto', description: 'Nome da cidade' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  pais?: string;

  @ApiPropertyOptional({ enum: CategoriaDestino, example: CategoriaDestino.CULTURAL })
  @IsEnum(CategoriaDestino)
  @IsOptional()
  categoria?: CategoriaDestino;

  @ApiPropertyOptional({ example: 'Cidade historica as margens do Rio Douro.' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ example: 41.1579 })
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: -8.6291 })
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ example: 'https://exemplo.com/porto.jpg' })
  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  fotoUrl?: string;
}
