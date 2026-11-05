import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FORMATO_DIA } from '../../../common/utils/formatos';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { ApararOuNulo } from '../../../common/validacao/texto';

/** Adicionar um destino do catalogo a uma viagem. */
export class AdicionarDestinoViagemDto {
  @ApiProperty({ example: 2, description: 'Id do destino no catalogo' })
  @IsInt({ message: 'O destinoCatalogoId deve ser um numero inteiro' })
  @Min(1, { message: 'O destinoCatalogoId deve ser maior que zero' })
  destinoCatalogoId!: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-01-17',
    description: 'Dia de chegada (aaaa-mm-dd), dentro do periodo da viagem',
  })
  @Matches(FORMATO_DIA, { message: 'Informe a chegada no formato aaaa-mm-dd (ex.: 2027-01-17)' })
  @IsOptional()
  chegada?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2027-01-24',
    description: 'Dia de saida (aaaa-mm-dd), nao antes da chegada',
  })
  @Matches(FORMATO_DIA, { message: 'Informe a saida no formato aaaa-mm-dd (ex.: 2027-01-24)' })
  @IsOptional()
  saida?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'Praias no sul da ilha' })
  @ApararOuNulo()
  @IsString({ message: 'A descricao deve ser um texto' })
  @MaxLength(2000, { message: 'A descricao deve ter no maximo 2000 caracteres' })
  @IsOptional()
  descricao?: string | null;

  @ApiPropertyOptional({
    example: 1,
    description: 'Posicao no roteiro (0 = primeiro). Omitida, o destino vai para o fim',
  })
  @OpcionalNaoNulo()
  @IsInt({ message: 'A ordem deve ser um numero inteiro' })
  @Min(0, { message: 'A ordem nao pode ser negativa' })
  ordem?: number;
}

export class ReordenarDestinosDto {
  @ApiProperty({
    type: [Number],
    example: [3, 1, 2],
    description: 'Ids de TODOS os destinos da viagem, na nova ordem de visita',
  })
  @IsArray({ message: 'Informe a lista de destinos' })
  @ArrayMinSize(1, { message: 'Informe ao menos um destino' })
  @ArrayMaxSize(200, { message: 'A lista aceita no maximo 200 destinos' })
  @ArrayUnique({ message: 'A lista nao pode repetir destinos' })
  @Type(() => Number)
  @IsInt({ each: true, message: 'Cada item deve ser o id (inteiro) de um destino da viagem' })
  destinos!: number[];
}
