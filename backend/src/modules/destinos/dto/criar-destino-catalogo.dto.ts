import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
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
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { Aparar, ApararOuNulo } from '../../../common/validacao/texto';

/** Cada destino do catalogo representa uma cidade. */
export class CriarDestinoCatalogoDto {
  @ApiProperty({ example: 'Porto', description: 'Nome da cidade' })
  @Aparar()
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome do destino nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Portugal' })
  @ApararOuNulo()
  @IsString({ message: 'O pais deve ser um texto' })
  @MaxLength(80, { message: 'O pais deve ter no maximo 80 caracteres' })
  @IsOptional()
  pais?: string | null;

  @ApiPropertyOptional({
    enum: CategoriaDestino,
    enumName: 'CategoriaDestino',
    nullable: true,
    example: CategoriaDestino.CULTURAL,
  })
  @IsEnum(CategoriaDestino, {
    message: `Categoria invalida: use ${Object.values(CategoriaDestino).join(', ')}`,
  })
  @IsOptional()
  categoria?: CategoriaDestino | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Cidade historica as margens do Rio Douro.',
  })
  @ApararOuNulo()
  @IsString({ message: 'A descricao deve ser um texto' })
  @MaxLength(2000, { message: 'A descricao deve ter no maximo 2000 caracteres' })
  @IsOptional()
  descricao?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 41.1579 })
  @IsLatitude({ message: 'Informe uma latitude valida (entre -90 e 90)' })
  @IsOptional()
  latitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: -8.6291 })
  @IsLongitude({ message: 'Informe uma longitude valida (entre -180 e 180)' })
  @IsOptional()
  longitude?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'http://localhost:4566/viajajunto-local-midia/publico/destinos/3f1c.jpg',
    description: 'URL da foto; use a `urlPublica` devolvida por POST /uploads',
  })
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'], require_protocol: true },
    { message: 'Informe uma URL valida para a foto' },
  )
  @MaxLength(500, { message: 'A URL da foto deve ter no maximo 500 caracteres' })
  @IsOptional()
  fotoUrl?: string | null;
}

/** Edicao do item do catalogo: envie so o que muda; `null` apaga um campo opcional. */
export class AtualizarDestinoCatalogoDto extends PartialType(
  OmitType(CriarDestinoCatalogoDto, ['nome'] as const),
) {
  @ApiPropertyOptional({ example: 'Porto' })
  @Aparar()
  @OpcionalNaoNulo()
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome do destino nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome?: string;
}
