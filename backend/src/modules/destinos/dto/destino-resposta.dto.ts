import { ApiProperty, PickType } from '@nestjs/swagger';
import { CategoriaDestino } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';

/** RF09 - destino (cidade) do catalogo global. */
export class DestinoCatalogoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Lisboa' })
  nome!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Portugal' })
  pais!: string | null;

  @ApiProperty({ enum: CategoriaDestino, nullable: true, example: CategoriaDestino.CIDADE })
  categoria!: CategoriaDestino | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Capital portuguesa, entre miradouros e o Tejo.',
  })
  descricao!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 38.7223 })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -9.1393 })
  longitude!: number | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  fotoUrl!: string | null;
}

export class DestinoCatalogoResumoDto extends PickType(DestinoCatalogoDto, [
  'id',
  'nome',
] as const) {}

export class PaginaDestinosDto extends PaginaBaseDto {
  @ApiProperty({ type: [DestinoCatalogoDto] })
  itens!: DestinoCatalogoDto[];
}

/** Campos proprios do destino dentro de uma viagem (RF08). */
export class DestinoViagemBaseDto {
  @ApiProperty({ example: 1, description: 'Id do destino na viagem: e o {destinoId}' })
  id!: number;

  @ApiProperty({ example: 'DEMO2027' })
  viagemId!: string;

  @ApiProperty({ example: 1 })
  destinoCatalogoId!: number;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-10T00:00:00.000Z' })
  chegada!: Date | null;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-16T00:00:00.000Z' })
  saida!: Date | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  descricao!: string | null;

  @ApiProperty({ example: 0, description: 'Ordem de visita, a partir de 0' })
  ordem!: number;
}

export class DestinoViagemDto extends DestinoViagemBaseDto {
  @ApiProperty({ type: DestinoCatalogoDto })
  destinoCatalogo!: DestinoCatalogoDto;
}

export class ContagemAtividadesDto {
  @ApiProperty({ example: 1 })
  atividades!: number;
}

export class DestinoViagemListaDto extends DestinoViagemDto {
  @ApiProperty({ type: ContagemAtividadesDto })
  _count!: ContagemAtividadesDto;
}
