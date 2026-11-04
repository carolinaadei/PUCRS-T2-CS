import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { FORMATO_DIA } from '../../../common/utils/formatos';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { Aparar, ApararOuNulo } from '../../../common/validacao/texto';

const MENSAGEM_STATUS = `Status invalido: use ${Object.values(StatusViagem).join(', ')}`;

/** Criar viagem com nome, descricao e datas gerais. Datas no formato aaaa-mm-dd. */
export class CriarViagemDto {
  @ApiProperty({ example: 'Eurotrip 2027' })
  @Aparar()
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da viagem nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Roteiro de 15 dias por Portugal, Espanha e Franca',
  })
  @ApararOuNulo()
  @IsString({ message: 'A descricao deve ser um texto' })
  @MaxLength(5000, { message: 'A descricao deve ter no maximo 5000 caracteres' })
  @IsOptional()
  descricao?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, example: '2027-01-10' })
  @Matches(FORMATO_DIA, {
    message: 'Informe a data de inicio no formato aaaa-mm-dd (ex.: 2027-01-10)',
  })
  @IsOptional()
  dataInicio?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date', nullable: true, example: '2027-01-25' })
  @Matches(FORMATO_DIA, {
    message: 'Informe a data de fim no formato aaaa-mm-dd (ex.: 2027-01-25)',
  })
  @IsOptional()
  dataFim?: string | null;

  @ApiPropertyOptional({
    enum: StatusViagem,
    enumName: 'StatusViagem',
    default: StatusViagem.EM_PLANEJAMENTO,
  })
  @OpcionalNaoNulo()
  @IsEnum(StatusViagem, { message: MENSAGEM_STATUS })
  status?: StatusViagem;
}

/**
 * Edicao da viagem, inclusive o status: envie so o que muda; `null` apaga a
 * descricao ou uma das datas. Nome e status nao aceitam `null`.
 *
 * Os dois sao redeclarados porque o PartialType poe @IsOptional em tudo, e o
 * @IsOptional deixa o `null` passar.
 */
export class AtualizarViagemDto extends PartialType(
  OmitType(CriarViagemDto, ['nome', 'status'] as const),
) {
  @ApiPropertyOptional({ example: 'Eurotrip 2027' })
  @Aparar()
  @OpcionalNaoNulo()
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome da viagem nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome?: string;

  @ApiPropertyOptional({ enum: StatusViagem, enumName: 'StatusViagem' })
  @OpcionalNaoNulo()
  @IsEnum(StatusViagem, { message: MENSAGEM_STATUS })
  status?: StatusViagem;
}
