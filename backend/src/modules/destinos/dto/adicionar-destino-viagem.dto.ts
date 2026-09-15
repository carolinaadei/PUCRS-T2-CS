import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** RF08 - adicionar um destino do catalogo a uma viagem, com ordem de visita. */
export class AdicionarDestinoViagemDto {
  @ApiProperty({ example: 1, description: 'Id do destino no catalogo' })
  @IsInt()
  destinoCatalogoId!: number;

  @ApiPropertyOptional({ example: '2027-01-10' })
  @IsDateString()
  @IsOptional()
  chegada?: string;

  @ApiPropertyOptional({ example: '2027-01-14' })
  @IsDateString()
  @IsOptional()
  saida?: string;

  @ApiPropertyOptional({ example: 'Ficar no bairro de Alfama' })
  @IsString()
  @IsOptional()
  descricao?: string;

  @ApiPropertyOptional({ example: 0, description: 'Ordem de visita; se omitida, vai para o fim' })
  @IsInt()
  @Min(0)
  @IsOptional()
  ordem?: number;
}
