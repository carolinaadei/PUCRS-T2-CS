import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** RF04 - criar viagem com nome, descricao e datas gerais. */
export class CriarViagemDto {
  @ApiProperty({ example: 'Eurotrip 2027' })
  // Aparado antes de validar, para que um nome so de espacos conte como em branco.
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da viagem nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Roteiro de 15 dias por Portugal, Espanha e Franca',
  })
  // Descricao em branco equivale a nenhuma descricao.
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString({ message: 'A descricao deve ser um texto' })
  @IsOptional()
  descricao?: string | null;

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
