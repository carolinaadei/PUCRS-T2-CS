import { paraOrigemLugar } from '../../geoapify/geoapify.dto';
import { DestinoCatalogo, DestinoViagem } from '@prisma/client';
import { paraDia } from '../../common/utils/formatos';
import {
  DestinoCatalogoDto,
  DestinoViagemDto,
  DestinoViagemListaDto,
} from './dto/destino-resposta.dto';

export const paraDestinoCatalogoDto = (destino: DestinoCatalogo): DestinoCatalogoDto => ({
  ...paraOrigemLugar(destino),
  id: destino.id,
  nome: destino.nome,
  pais: destino.pais,
  categoria: destino.categoria,
  descricao: destino.descricao,
  latitude: destino.latitude,
  longitude: destino.longitude,
  fotoUrl: destino.fotoUrl,
  criadoPor: destino.criadoPor,
  criadoEm: destino.criadoEm,
});

export type DestinoViagemComCatalogo = DestinoViagem & { destinoCatalogo: DestinoCatalogo };

export const paraDestinoViagemDto = (destino: DestinoViagemComCatalogo): DestinoViagemDto => ({
  id: destino.id,
  viagemId: destino.viagemId,
  destinoCatalogoId: destino.destinoCatalogoId,
  chegada: paraDia(destino.chegada),
  saida: paraDia(destino.saida),
  descricao: destino.descricao,
  ordem: destino.ordem,
  destinoCatalogo: paraDestinoCatalogoDto(destino.destinoCatalogo),
});

export const paraDestinoViagemListaDto = (
  destino: DestinoViagemComCatalogo & { _count: { atividades: number } },
): DestinoViagemListaDto => ({
  ...paraDestinoViagemDto(destino),
  totais: { atividades: destino._count.atividades },
});
