import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * RF12, RF13 - DTO de entrada para agendar uma atividade cadastrada dentro de um destino da viagem.
 * Contem os atributos especificos do planejamento: destino, data/horario, duracao, custo e status.
 */
export class AdicionarAtividadeViagemDto {
  /** Identificador do destino dentro da viagem onde a atividade sera realizada (RF12). */
  @ApiProperty({ example: 1, description: 'Id do destino dentro desta viagem' })
  @IsInt({ message: 'O destinoViagemId deve ser um numero inteiro' })
  @Min(1, { message: 'O destinoViagemId deve ser maior que zero' })
  destinoViagemId!: number;

  /** Identificador da atividade previamente cadastrada no catalogo (RF12). */
  @ApiProperty({ example: 1, description: 'Id da atividade no catalogo' })
  @IsInt({ message: 'O catalogoAtividadeId deve ser um numero inteiro' })
  @Min(1, { message: 'O catalogoAtividadeId deve ser maior que zero' })
  catalogoAtividadeId!: number;

  /** Data e horario previstos para a atividade em formato ISO 8601 (RF13, RF14). */
  @ApiPropertyOptional({ example: '2027-01-11T14:30:00.000Z' })
  @IsDateString({}, { message: 'A data e horario devem estar em formato ISO 8601 valido' })
  @IsOptional()
  dataHorario?: string;

  /** Duracao estimada da atividade em minutos (RF13). */
  @ApiPropertyOptional({ example: 90, description: 'Duracao estimada em minutos' })
  @IsInt({ message: 'A duracao estimada deve ser um numero inteiro em minutos' })
  @Min(0, { message: 'A duracao estimada nao pode ser negativa' })
  @IsOptional()
  duracaoMin?: number;

  /** Custo previsto da atividade para composicao do orcamento da viagem (RF13, RF16). */
  @ApiPropertyOptional({ example: 250.5, description: 'Custo previsto (RF16)' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'O custo previsto deve ser um numero com ate 2 casas decimais' },
  )
  @Min(0, { message: 'O custo previsto nao pode ser negativo' })
  @IsOptional()
  custoPrevisto?: number;

  /** Status atual da atividade no roteiro: PENDENTE, CONFIRMADA ou CONCLUIDA (RF13). */
  @ApiPropertyOptional({ enum: StatusAtividade, default: StatusAtividade.PENDENTE })
  @IsEnum(StatusAtividade, {
    message: 'Status da atividade invalido. Valores permitidos: PENDENTE, CONFIRMADA, CONCLUIDA',
  })
  @IsOptional()
  status?: StatusAtividade;
}
