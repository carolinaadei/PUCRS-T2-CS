import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** RF04 - criar viagem com nome, descricao e datas gerais. */
export class CriarViagemDto {
  @ApiProperty({ example: 'Eurotrip 2027' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiPropertyOptional({ example: 'Roteiro de 15 dias por Portugal, Espanha e Franca' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ example: '2027-01-10', description: 'Data no formato ISO (yyyy-mm-dd)' })
  @IsDateString()
  @IsOptional()
  dataInicio?: string;

  @ApiPropertyOptional({ example: '2027-01-25' })
  @IsDateString()
  @IsOptional()
  dataFim?: string;

  @ApiPropertyOptional({ enum: StatusViagem, default: StatusViagem.EM_PLANEJAMENTO })
  @IsEnum(StatusViagem)
  @IsOptional()
  status?: StatusViagem;
}
