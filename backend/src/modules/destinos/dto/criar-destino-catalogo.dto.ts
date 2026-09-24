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
  @ApiProperty({ example: 'Lisboa', description: 'Nome da cidade' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  pais?: string;

  @ApiPropertyOptional({ enum: CategoriaDestino })
  @IsEnum(CategoriaDestino)
  @IsOptional()
  categoria?: CategoriaDestino;

  @ApiPropertyOptional({ example: 'Capital portuguesa, a beira do Tejo' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ example: 38.7223 })
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: -9.1393 })
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ example: 'https://exemplo.com/lisboa.jpg' })
  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  fotoUrl?: string;
}
