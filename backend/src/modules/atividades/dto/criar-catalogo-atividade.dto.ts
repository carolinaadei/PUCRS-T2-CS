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

/**
 * RF12, RF13 - DTO de entrada para cadastrar uma atividade ou local no catalogo global.
 * Contem os atributos descritivos reutilizaveis entre viagens (foto, nome, tipo/categoria e local).
 */
export class CriarCatalogoAtividadeDto {
  /** Nome da atividade ou ponto de interesse (obrigatorio, ate 180 caracteres). */
  @ApiProperty({ example: 'Torre de Belem' })
  @IsString({ message: 'O nome da atividade deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da atividade nao pode ficar em branco' })
  @MaxLength(180, { message: 'O nome da atividade deve ter no maximo 180 caracteres' })
  nome!: string;

  /** Descricao detalhada sobre a atividade ou local (opcional). */
  @ApiPropertyOptional({ example: 'Fortaleza do seculo XVI na margem do Tejo' })
  @IsString({ message: 'A descricao deve ser um texto' })
  @IsOptional()
  descricao?: string;

  /** Tipo ou categoria da atividade: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE ou OUTRO (RF12, RF13). */
  @ApiProperty({ enum: TipoAtividade })
  @IsEnum(TipoAtividade, {
    message:
      'Tipo de atividade invalido. Valores permitidos: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
  })
  tipoAtividade!: TipoAtividade;

  /** Endereco ou referencia do local onde ocorre a atividade (RF13). */
  @ApiPropertyOptional({ example: 'Av. Brasilia' })
  @IsString({ message: 'O local deve ser um texto' })
  @IsOptional()
  @MaxLength(255, { message: 'O local deve ter no maximo 255 caracteres' })
  local?: string;

  /** Cidade onde a atividade esta localizada. */
  @ApiPropertyOptional({ example: 'Lisboa' })
  @IsString({ message: 'A cidade deve ser um texto' })
  @IsOptional()
  @MaxLength(120, { message: 'A cidade deve ter no maximo 120 caracteres' })
  cidade?: string;

  /** Pais onde a atividade esta localizada. */
  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString({ message: 'O pais deve ser um texto' })
  @IsOptional()
  @MaxLength(80, { message: 'O pais deve ter no maximo 80 caracteres' })
  pais?: string;

  /** Coordenada de latitude para exibicao no mapa. */
  @ApiPropertyOptional({ example: 38.6916 })
  @IsLatitude({ message: 'Informe uma latitude valida (entre -90 e 90)' })
  @IsOptional()
  latitude?: number;

  /** Coordenada de longitude para exibicao no mapa. */
  @ApiPropertyOptional({ example: -9.216 })
  @IsLongitude({ message: 'Informe uma longitude valida (entre -180 e 180)' })
  @IsOptional()
  longitude?: number;

  /** Identificador unico do local na Google Places API, caso aplicavel. */
  @ApiPropertyOptional({
    description: 'Identificador do local na Google Places API',
    example: 'ChIJ1Ww5Hc80GQ0RXkYcB6Ew3xE',
  })
  @IsString({ message: 'O googlePlaceId deve ser um texto' })
  @IsOptional()
  @MaxLength(255, { message: 'O googlePlaceId deve ter no maximo 255 caracteres' })
  googlePlaceId?: string;

  /** URL da foto ilustrativa da atividade (RF13). */
  @ApiPropertyOptional({ example: 'https://exemplo.com/torre-belem.jpg' })
  @IsUrl({}, { message: 'Informe uma URL valida para a foto' })
  @IsOptional()
  @MaxLength(500, { message: 'A URL da foto deve ter no maximo 500 caracteres' })
  fotoUrl?: string;
}
