import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma, TipoAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Aparar } from '../common/validacao/texto';

export class AtribuicaoDto {
  @ApiProperty({ example: 'Powered by Geoapify' })
  texto!: string;

  @ApiProperty({ example: 'https://www.geoapify.com/' })
  url!: string;
}

export class OrigemLugarDto {
  @ApiProperty({ example: 'geoapify', enum: ['manual', 'seed', 'geoapify'] })
  fonte!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Identificador no fornecedor; use o id interno para vincular a viagens',
  })
  idExterno!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'PT' })
  codigoPais!: string | null;

  @ApiProperty({
    type: [AtribuicaoDto],
    description: 'O cliente deve exibir estes creditos com links junto dos dados',
  })
  atribuicoes!: AtribuicaoDto[];
}

export const paraOrigemLugar = (lugar: {
  fonte: string;
  idExterno: string | null;
  codigoPais: string | null;
  atribuicoes: Prisma.JsonValue;
}): OrigemLugarDto => ({
  fonte: lugar.fonte,
  idExterno: lugar.idExterno,
  codigoPais: lugar.codigoPais,
  atribuicoes: lugar.atribuicoes as unknown as AtribuicaoDto[],
});

export class BuscarCidadesDto {
  @ApiProperty({ example: 'Porto', minLength: 2, maxLength: 120 })
  @Aparar()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  busca!: string;

  @ApiPropertyOptional({ example: 'pt', description: 'Filtro de pais ISO alfa-2' })
  @Matches(/^[a-zA-Z]{2}$/)
  @IsOptional()
  pais?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @IsIn(['true', 'false'])
  @IsOptional()
  autocompletar: string = 'false';

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limite: number = 5;
}

export class BuscarLugaresDto {
  @ApiProperty({ example: 41.1496, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: -8.6109, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    enum: TipoAtividade,
    enumName: 'TipoAtividade',
    default: TipoAtividade.PASSEIO,
  })
  @IsEnum(TipoAtividade)
  @IsOptional()
  tipoAtividade: TipoAtividade = TipoAtividade.PASSEIO;

  @ApiPropertyOptional({ default: 5000, minimum: 100, maximum: 50000, description: 'Metros' })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50000)
  @IsOptional()
  raio: number = 5000;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  limite: number = 20;
}

export class ImportarLugarDto {
  @ApiProperty({
    description: 'idExterno retornado pela busca Geoapify',
    minLength: 2,
    maxLength: 2048,
  })
  @Aparar()
  @IsString()
  @MinLength(2)
  @MaxLength(2048)
  idExterno!: string;
}

export class LugarExternoDto extends OrigemLugarDto {
  @ApiProperty({ example: 'Torre dos Clerigos' })
  nome!: string;

  @ApiProperty({ type: String, nullable: true })
  local!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Porto' })
  cidade!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Portugal' })
  pais!: string | null;

  @ApiProperty({ example: 41.1496 })
  latitude!: number;

  @ApiProperty({ example: -8.6109 })
  longitude!: number;

  @ApiProperty({ enum: TipoAtividade, enumName: 'TipoAtividade' })
  tipoAtividade!: TipoAtividade;

  @ApiProperty({ example: false, description: 'Pode ser importado como destino de cidade' })
  ehCidade!: boolean;
}
