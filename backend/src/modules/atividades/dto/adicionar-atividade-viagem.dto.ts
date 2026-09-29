import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusAtividade } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/** RF12, RF13 - agenda uma atividade do catalogo dentro de um destino da viagem. */
export class AdicionarAtividadeViagemDto {
  @ApiProperty({ example: 1, description: 'Id do destino dentro desta viagem' })
  @IsInt()
  destinoViagemId!: number;

  @ApiProperty({ example: 1, description: 'Id da atividade no catalogo' })
  @IsInt()
  catalogoAtividadeId!: number;

  @ApiPropertyOptional({ example: '2027-01-11T14:30:00.000Z' })
  @IsDateString()
  @IsOptional()
  dataHorario?: string;

  @ApiPropertyOptional({ example: 90, description: 'Duracao estimada em minutos' })
  @IsInt()
  @Min(0)
  @IsOptional()
  duracaoMin?: number;

  @ApiPropertyOptional({ example: 250.5, description: 'Custo previsto (RF16)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  custoPrevisto?: number;

  @ApiPropertyOptional({ enum: StatusAtividade, default: StatusAtividade.PENDENTE })
  @IsEnum(StatusAtividade)
  @IsOptional()
  status?: StatusAtividade;
}
