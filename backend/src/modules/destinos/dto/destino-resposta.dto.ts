import { ApiProperty, PickType } from '@nestjs/swagger';
import { CategoriaDestino } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';

/** Destino (cidade) do catalogo global. */
export class DestinoCatalogoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Lisboa' })
  nome!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Portugal' })
  pais!: string | null;

  @ApiProperty({
    enum: CategoriaDestino,
    enumName: 'CategoriaDestino',
    nullable: true,
    example: CategoriaDestino.CIDADE,
  })
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

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 1,
    description: 'Quem cadastrou (so essa pessoa edita ou exclui); null nos itens do sistema',
  })
  criadoPor!: number | null;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  criadoEm!: Date;
}

export class DestinoCatalogoResumoDto extends PickType(DestinoCatalogoDto, [
  'id',
  'nome',
  'pais',
] as const) {}

export class PaginaDestinosDto extends PaginaBaseDto {
  @ApiProperty({ type: [DestinoCatalogoDto] })
  itens!: DestinoCatalogoDto[];
}

/** Destino em destaque: media das avaliacoes das atividades feitas nele. */
export class DestinoDestaqueDto extends DestinoCatalogoDto {
  @ApiProperty({ example: 4.6, description: 'Media de 1 a 5, com uma casa decimal' })
  mediaAvaliacao!: number;

  @ApiProperty({ example: 12, description: 'Avaliacoes que entraram na media' })
  totalAvaliacoes!: number;
}

/** Campos proprios do destino dentro de uma viagem. */
export class DestinoViagemBaseDto {
  @ApiProperty({ example: 1, description: 'Id do destino na viagem: e o {destinoId}' })
  id!: number;

  @ApiProperty({ example: 'DEMO2027' })
  viagemId!: string;

  @ApiProperty({ example: 1 })
  destinoCatalogoId!: number;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-10' })
  chegada!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-16' })
  saida!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  descricao!: string | null;

  @ApiProperty({ example: 0, description: 'Posicao no roteiro, de 0 a n-1' })
  ordem!: number;
}

export class DestinoViagemDto extends DestinoViagemBaseDto {
  @ApiProperty({ type: DestinoCatalogoDto })
  destinoCatalogo!: DestinoCatalogoDto;
}

export class TotaisDestinoDto {
  @ApiProperty({ example: 1 })
  atividades!: number;
}

export class DestinoViagemListaDto extends DestinoViagemDto {
  @ApiProperty({ type: TotaisDestinoDto })
  totais!: TotaisDestinoDto;
}
