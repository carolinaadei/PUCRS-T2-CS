import { Avaliacao } from '@prisma/client';
import { AvaliacaoDto } from './dto/avaliacao-resposta.dto';

export type AvaliacaoComAutor = Avaliacao & { usuario: { id: number; nome: string } };

/** Include do Prisma que traz so os dados publicos do autor. */
export const INCLUIR_AUTOR = { usuario: { select: { id: true, nome: true } } } as const;

export const paraAvaliacaoDto = (avaliacao: AvaliacaoComAutor): AvaliacaoDto => ({
  id: avaliacao.id,
  catalogoAtividadeId: avaliacao.catalogoAtividadeId,
  nota: avaliacao.nota,
  comentario: avaliacao.comentario,
  criadoEm: avaliacao.criadoEm,
  atualizadoEm: avaliacao.atualizadoEm,
  autor: { id: avaliacao.usuario.id, nome: avaliacao.usuario.nome },
});
