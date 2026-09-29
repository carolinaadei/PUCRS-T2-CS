import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** RF04 - criar viagem com nome, descricao e datas gerais. */
export class CriarViagemDto {
  @ApiProperty({ example: 'Eurotrip 2027' })
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da viagem nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome!: string;

  @ApiPropertyOptional({ example: 'Roteiro de 15 dias por Portugal, Espanha e Franca' })
  @IsString({ message: 'A descricao deve ser um texto' })
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ example: '2027-01-10', description: 'Data no formato aaaa-mm-dd' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data de inicio no formato aaaa-mm-dd' })
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional({ example: '2027-01-25', description: 'Data no formato aaaa-mm-dd' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data de fim no formato aaaa-mm-dd' })
  @IsOptional()
  dataFim?: string;

  @ApiPropertyOptional({ enum: StatusViagem, default: StatusViagem.EM_PLANEJAMENTO })
  @IsEnum(StatusViagem, { message: 'Status invalido para a viagem' })
  @IsOptional()
  status?: StatusViagem;
}
