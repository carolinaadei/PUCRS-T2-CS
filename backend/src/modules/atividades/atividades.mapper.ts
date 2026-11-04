import { AtividadeViagem, CatalogoAtividade } from '@prisma/client';
import { paraDinheiro } from '../../common/utils/formatos';
import { AvaliacaoComAutor, paraAvaliacaoDto } from '../avaliacoes/avaliacoes.mapper';
import {
  AtividadeDetalheDto,
  AtividadeViagemDto,
  AtividadeViagemListaDto,
  CatalogoAtividadeDto,
} from './dto/atividade-resposta.dto';

export type CatalogoComContagem = CatalogoAtividade & { _count: { avaliacoes: number } };

/** Include padrao do catalogo: a contagem vira `totalAvaliacoes`. */
export const CONTAR_AVALIACOES = { _count: { select: { avaliacoes: true } } } as const;

export const paraCatalogoAtividadeDto = (atividade: CatalogoComContagem): CatalogoAtividadeDto => ({
  id: atividade.id,
  nome: atividade.nome,
  descricao: atividade.descricao,
  tipoAtividade: atividade.tipoAtividade,
  local: atividade.local,
  cidade: atividade.cidade,
  pais: atividade.pais,
  latitude: atividade.latitude,
  longitude: atividade.longitude,
  googlePlaceId: atividade.googlePlaceId,
  fotoUrl: atividade.fotoUrl,
  fonte: atividade.fonte,
  mediaAvaliacao: atividade.mediaAvaliacao,
  totalAvaliacoes: atividade._count.avaliacoes,
  criadoPor: atividade.criadoPor,
  criadoEm: atividade.criadoEm,
});

export const paraAtividadeDetalheDto = (
  atividade: CatalogoComContagem & { avaliacoes: AvaliacaoComAutor[] },
): AtividadeDetalheDto => ({
  ...paraCatalogoAtividadeDto(atividade),
  avaliacoesRecentes: atividade.avaliacoes.map(paraAvaliacaoDto),
});

export type AtividadeViagemCompleta = AtividadeViagem & { catalogoAtividade: CatalogoComContagem };

/** Include padrao de uma atividade da viagem. */
export const INCLUIR_CATALOGO = { catalogoAtividade: { include: CONTAR_AVALIACOES } } as const;

export const paraAtividadeViagemDto = (atividade: AtividadeViagemCompleta): AtividadeViagemDto => ({
  id: atividade.id,
  destinoViagemId: atividade.destinoViagemId,
  catalogoAtividadeId: atividade.catalogoAtividadeId,
  dataHorario: atividade.dataHorario,
  duracaoMin: atividade.duracaoMin,
  custoPrevisto: paraDinheiro(atividade.custoPrevisto),
  status: atividade.status,
  catalogoAtividade: paraCatalogoAtividadeDto(atividade.catalogoAtividade),
});

export const paraAtividadeViagemListaDto = (
  atividade: AtividadeViagemCompleta & {
    destinoViagem: {
      id: number;
      ordem: number;
      destinoCatalogo: { id: number; nome: string; pais: string | null };
    };
  },
): AtividadeViagemListaDto => ({
  ...paraAtividadeViagemDto(atividade),
  destinoViagem: {
    id: atividade.destinoViagem.id,
    ordem: atividade.destinoViagem.ordem,
    destinoCatalogo: atividade.destinoViagem.destinoCatalogo,
  },
});
