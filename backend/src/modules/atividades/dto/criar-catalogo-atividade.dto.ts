import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
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
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { Aparar, ApararOuNulo } from '../../../common/validacao/texto';

const MENSAGEM_TIPO = `Tipo de atividade invalido: use ${Object.values(TipoAtividade).join(', ')}`;

/** Atividade ou local do catalogo global, reaproveitavel entre viagens. */
export class CriarCatalogoAtividadeDto {
  @ApiProperty({ example: 'Torre de Belem' })
  @Aparar()
  @IsString({ message: 'O nome da atividade deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da atividade nao pode ficar em branco' })
  @MaxLength(180, { message: 'O nome da atividade deve ter no maximo 180 caracteres' })
  nome!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Fortaleza do seculo XVI na margem do Tejo',
  })
  @ApararOuNulo()
  @IsString({ message: 'A descricao deve ser um texto' })
  @MaxLength(2000, { message: 'A descricao deve ter no maximo 2000 caracteres' })
  @IsOptional()
  descricao?: string | null;

  @ApiProperty({ enum: TipoAtividade, enumName: 'TipoAtividade' })
  @IsEnum(TipoAtividade, { message: MENSAGEM_TIPO })
  tipoAtividade!: TipoAtividade;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Av. Brasilia' })
  @ApararOuNulo()
  @IsString({ message: 'O local deve ser um texto' })
  @MaxLength(255, { message: 'O local deve ter no maximo 255 caracteres' })
  @IsOptional()
  local?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Lisboa' })
  @ApararOuNulo()
  @IsString({ message: 'A cidade deve ser um texto' })
  @MaxLength(120, { message: 'A cidade deve ter no maximo 120 caracteres' })
  @IsOptional()
  cidade?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Portugal' })
  @ApararOuNulo()
  @IsString({ message: 'O pais deve ser um texto' })
  @MaxLength(80, { message: 'O pais deve ter no maximo 80 caracteres' })
  @IsOptional()
  pais?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 38.6916 })
  @IsLatitude({ message: 'Informe uma latitude valida (entre -90 e 90)' })
  @IsOptional()
  latitude?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: -9.216 })
  @IsLongitude({ message: 'Informe uma longitude valida (entre -180 e 180)' })
  @IsOptional()
  longitude?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'http://localhost:4566/viajajunto-local-midia/publico/atividades/9a2b.jpg',
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
export class AtualizarCatalogoAtividadeDto extends PartialType(
  OmitType(CriarCatalogoAtividadeDto, ['nome', 'tipoAtividade'] as const),
) {
  @ApiPropertyOptional({ example: 'Torre de Belem' })
  @Aparar()
  @OpcionalNaoNulo()
  @IsString({ message: 'O nome da atividade deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da atividade nao pode ficar em branco' })
  @MaxLength(180, { message: 'O nome da atividade deve ter no maximo 180 caracteres' })
  nome?: string;

  @ApiPropertyOptional({ enum: TipoAtividade, enumName: 'TipoAtividade' })
  @OpcionalNaoNulo()
  @IsEnum(TipoAtividade, { message: MENSAGEM_TIPO })
  tipoAtividade?: TipoAtividade;
}
