import { ApiPropertyOptional } from '@nestjs/swagger';
import { TipoAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/**
 * RF24 - DTO de consulta para listagem paginada do catalogo de atividades,
 * permitindo filtragem por termo de busca, tipo/categoria, localizacao e nota minima.
 */
export class BuscarAtividadesDto extends PaginacaoDto {
  /** Termo para busca parcial pelo nome da atividade (case-insensitive). */
  @ApiPropertyOptional({ description: 'Busca por nome', example: 'Torre de Belem' })
  @IsString({ message: 'O termo de busca deve ser um texto' })
  @IsOptional()
  busca?: string;

  /** Filtro por tipo/categoria da atividade (PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO). */
  @ApiPropertyOptional({ enum: TipoAtividade })
  @IsEnum(TipoAtividade, {
    message:
      'Tipo de atividade invalido. Valores permitidos: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
  })
  @IsOptional()
  tipoAtividade?: TipoAtividade;

  /** Filtro exato pelo nome da cidade (case-insensitive). */
  @ApiPropertyOptional({ example: 'Lisboa' })
  @IsString({ message: 'A cidade deve ser um texto' })
  @IsOptional()
  cidade?: string;

  /** Filtro exato pelo nome do pais (case-insensitive). */
  @ApiPropertyOptional({ example: 'Portugal' })
  @IsString({ message: 'O pais deve ser um texto' })
  @IsOptional()
  pais?: string;

  /** Filtro pela media minima de avaliacoes (de 0 a 5 estrelas). */
  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 5, description: 'Nota media minima' })
  @Type(() => Number)
  @IsNumber({}, { message: 'A nota minima deve ser um numero' })
  @Min(0, { message: 'A nota minima nao pode ser menor que 0' })
  @Max(5, { message: 'A nota minima nao pode ser maior que 5' })
  @IsOptional()
  notaMinima?: number;
}
