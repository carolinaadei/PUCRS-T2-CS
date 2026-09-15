import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';
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

/** Entrada do catalogo global de atividades/locais. */
export class CriarCatalogoAtividadeDto {
  @ApiProperty({ example: 'Torre de Belem' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  nome!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiProperty({ enum: TipoAtividade })
  @IsEnum(TipoAtividade)
  tipoAtividade!: TipoAtividade;

  @ApiPropertyOptional({ example: 'Av. Brasilia' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  local?: string;

  @ApiPropertyOptional({ example: 'Lisboa' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  cidade?: string;

  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString()
  @IsOptional()
  @MaxLength(80)
  pais?: string;

  @ApiPropertyOptional({ example: 38.6916 })
  @IsLatitude()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: -9.216 })
  @IsLongitude()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Identificador do local na Google Places API' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  googlePlaceId?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  fotoUrl?: string;
}
