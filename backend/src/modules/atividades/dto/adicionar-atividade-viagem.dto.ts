import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, Matches, Max, Min } from 'class-validator';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';

/**
 * Instante em ISO 8601 COM fuso. Sem o fuso, "14:30" seria lido no fuso do
 * servidor e a atividade mudaria de horario conforme onde a API roda.
 */
export const FORMATO_INSTANTE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Maior valor que cabe em `custo_previsto`, um Decimal(10,2). */
export const MAIOR_CUSTO = 99_999_999.99;

/** Agendar uma atividade do catalogo dentro de um destino da viagem. */
export class AdicionarAtividadeViagemDto {
  @ApiProperty({ example: 1, description: 'Id do destino dentro desta viagem' })
  @IsInt({ message: 'O destinoViagemId deve ser um numero inteiro' })
  @Min(1, { message: 'O destinoViagemId deve ser maior que zero' })
  destinoViagemId!: number;

  @ApiProperty({ example: 1, description: 'Id da atividade no catalogo' })
  @IsInt({ message: 'O catalogoAtividadeId deve ser um numero inteiro' })
  @Min(1, { message: 'O catalogoAtividadeId deve ser maior que zero' })
  catalogoAtividadeId!: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2027-01-11T14:30:00-03:00',
    description: 'Data e horario em ISO 8601 com fuso',
  })
  @Matches(FORMATO_INSTANTE, {
    message: 'Informe data e horario em ISO 8601 com fuso (ex.: 2027-01-11T14:30:00-03:00)',
  })
  @IsOptional()
  dataHorario?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 90, description: 'Minutos' })
  @IsInt({ message: 'A duracao estimada deve ser um numero inteiro de minutos' })
  @Min(0, { message: 'A duracao estimada nao pode ser negativa' })
  @Max(60 * 24 * 30, { message: 'A duracao estimada deve ser de no maximo 30 dias' })
  @IsOptional()
  duracaoMin?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 250.5 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'O custo previsto deve ser um numero com ate 2 casas decimais' },
  )
  @Min(0, { message: 'O custo previsto nao pode ser negativo' })
  @Max(MAIOR_CUSTO, { message: `O custo previsto deve ser de no maximo ${MAIOR_CUSTO}` })
  @IsOptional()
  custoPrevisto?: number | null;

  @ApiPropertyOptional({
    enum: StatusAtividade,
    enumName: 'StatusAtividade',
    default: StatusAtividade.PENDENTE,
  })
  @OpcionalNaoNulo()
  @IsEnum(StatusAtividade, {
    message: `Status invalido: use ${Object.values(StatusAtividade).join(', ')}`,
  })
  status?: StatusAtividade;
}
