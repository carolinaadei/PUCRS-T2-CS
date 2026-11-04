import { ApiProperty } from '@nestjs/swagger';
import { StatusAtividade, TipoAtividade } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';
import { AvaliacaoDto } from '../../avaliacoes/dto/avaliacao-resposta.dto';
import { DestinoCatalogoResumoDto } from '../../destinos/dto/destino-resposta.dto';

/** Atividade/local do catalogo global. */
export class CatalogoAtividadeDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Torre de Belem' })
  nome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Fortificacao do seculo XVI as margens do Tejo.',
  })
  descricao!: string | null;

  @ApiProperty({ enum: TipoAtividade, enumName: 'TipoAtividade', example: TipoAtividade.PASSEIO })
  tipoAtividade!: TipoAtividade;

  @ApiProperty({ type: String, nullable: true, example: 'Av. Brasilia' })
  local!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Lisboa' })
  cidade!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Portugal' })
  pais!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 38.6916 })
  latitude!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: -9.216 })
  longitude!: number | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  googlePlaceId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  fotoUrl!: string | null;

  @ApiProperty({
    example: 'manual',
    enum: ['manual', 'seed', 'google_places'],
    description: 'Origem do cadastro',
  })
  fonte!: string;

  @ApiProperty({ example: 4.5, description: 'Media das notas, de 1 a 5 (0 sem avaliacoes)' })
  mediaAvaliacao!: number;

  @ApiProperty({ example: 12 })
  totalAvaliacoes!: number;

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

export class PaginaAtividadesDto extends PaginaBaseDto {
  @ApiProperty({ type: [CatalogoAtividadeDto] })
  itens!: CatalogoAtividadeDto[];
}

/** Pagina publica da atividade. */
export class AtividadeDetalheDto extends CatalogoAtividadeDto {
  @ApiProperty({
    type: [AvaliacaoDto],
    description: 'As 20 avaliacoes mais recentes; o resto em GET /atividades/{id}/avaliacoes',
  })
  avaliacoesRecentes!: AvaliacaoDto[];
}

/** Atividade agendada dentro de um destino da viagem. */
export class AtividadeViagemDto {
  @ApiProperty({ example: 1, description: 'Id da atividade na viagem: e o {atividadeId}' })
  id!: number;

  @ApiProperty({ example: 1 })
  destinoViagemId!: number;

  @ApiProperty({ example: 1 })
  catalogoAtividadeId!: number;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-11T17:30:00.000Z' })
  dataHorario!: Date | null;

  @ApiProperty({ type: Number, nullable: true, example: 90, description: 'Minutos' })
  duracaoMin!: number | null;

  @ApiProperty({ type: String, nullable: true, example: '120.00', description: 'Custo previsto' })
  custoPrevisto!: string | null;

  @ApiProperty({
    enum: StatusAtividade,
    enumName: 'StatusAtividade',
    example: StatusAtividade.CONFIRMADA,
  })
  status!: StatusAtividade;

  @ApiProperty({ type: CatalogoAtividadeDto })
  catalogoAtividade!: CatalogoAtividadeDto;
}

export class DestinoDaAtividadeDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 0 })
  ordem!: number;

  @ApiProperty({ type: DestinoCatalogoResumoDto })
  destinoCatalogo!: DestinoCatalogoResumoDto;
}

export class AtividadeViagemListaDto extends AtividadeViagemDto {
  @ApiProperty({ type: DestinoDaAtividadeDto })
  destinoViagem!: DestinoDaAtividadeDto;
}
