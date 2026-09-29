import { ApiProperty } from '@nestjs/swagger';
import { StatusAtividade, TipoAtividade } from '@prisma/client';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';
import { AvaliacaoDto } from '../../avaliacoes/dto/avaliacao-resposta.dto';
import {
  DestinoCatalogoResumoDto,
  DestinoViagemBaseDto,
} from '../../destinos/dto/destino-resposta.dto';

/** RF23, RF24 - atividade/local do catalogo global. */
export class CatalogoAtividadeDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Torre de Belem' })
  nome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Fortaleza do seculo XVI na margem do Tejo',
  })
  descricao!: string | null;

  @ApiProperty({ enum: TipoAtividade, example: TipoAtividade.PASSEIO })
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

  @ApiProperty({ type: String, nullable: true, example: 'ChIJ1Ww5Hc80GQ0RXkYcB6Ew3xE' })
  googlePlaceId!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'https://exemplo.com/torre-belem.jpg' })
  fotoUrl!: string | null;

  @ApiProperty({ example: 'google_places', description: 'Origem do cadastro' })
  fonte!: string;

  @ApiProperty({ example: 4.6, description: 'Media das notas, de 0 a 5 (0 sem avaliacoes)' })
  mediaAvaliacao!: number;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  criadoEm!: Date;
}

export class PaginaAtividadesDto extends PaginaBaseDto {
  @ApiProperty({ type: [CatalogoAtividadeDto] })
  itens!: CatalogoAtividadeDto[];
}

export class ContagemAvaliacoesDto {
  @ApiProperty({ example: 12 })
  avaliacoes!: number;
}

/** RF25 - atividade em destaque, com o total de avaliacoes. */
export class AtividadeDestaqueDto extends CatalogoAtividadeDto {
  @ApiProperty({ type: ContagemAvaliacoesDto })
  _count!: ContagemAvaliacoesDto;
}

/** RF23 - pagina publica da atividade. */
export class AtividadeDetalheDto extends AtividadeDestaqueDto {
  @ApiProperty({ type: [AvaliacaoDto], description: 'As 20 avaliacoes mais recentes' })
  avaliacoes!: AvaliacaoDto[];
}

/** RF12, RF13 - atividade agendada dentro de um destino da viagem. */
export class AtividadeViagemDto {
  @ApiProperty({ example: 10, description: 'Id da atividade na viagem: e o {atividadeId}' })
  id!: number;

  @ApiProperty({ example: 4 })
  destinoViagemId!: number;

  @ApiProperty({ example: 1 })
  catalogoAtividadeId!: number;

  @ApiProperty({ type: Date, nullable: true, example: '2027-01-11T14:30:00.000Z' })
  dataHorario!: Date | null;

  @ApiProperty({ type: Number, nullable: true, example: 90, description: 'Minutos' })
  duracaoMin!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '250.5',
    description: 'Custo previsto (Decimal como string)',
  })
  custoPrevisto!: string | null;

  @ApiProperty({ enum: StatusAtividade, example: StatusAtividade.PENDENTE })
  status!: StatusAtividade;

  @ApiProperty({ type: CatalogoAtividadeDto })
  catalogoAtividade!: CatalogoAtividadeDto;
}

export class DestinoDaAtividadeDto extends DestinoViagemBaseDto {
  @ApiProperty({ type: DestinoCatalogoResumoDto })
  destinoCatalogo!: DestinoCatalogoResumoDto;
}

export class AtividadeViagemListaDto extends AtividadeViagemDto {
  @ApiProperty({ type: DestinoDaAtividadeDto })
  destinoViagem!: DestinoDaAtividadeDto;
}
