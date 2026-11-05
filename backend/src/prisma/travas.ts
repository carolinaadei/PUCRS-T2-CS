import { Prisma } from '@prisma/client';

/**
 * Trava a linha da viagem ate o fim da transacao (SELECT ... FOR UPDATE).
 *
 * Serializa as escritas que mexem num campo derivado da viagem - o previsto do
 * orcamento. Sem a trava, duas atividades gravadas ao mesmo tempo somariam os
 * custos cada uma sem ver a outra, e o total ficaria errado (READ COMMITTED).
 */
export async function travarViagem(tx: Prisma.TransactionClient, viagemId: string) {
  await tx.$queryRaw`SELECT id FROM viagem WHERE id = ${viagemId} FOR UPDATE`;
}

/** Mesma ideia, para a media de avaliacoes de uma atividade do catalogo. */
export async function travarAtividadeCatalogo(tx: Prisma.TransactionClient, id: number) {
  await tx.$queryRaw`SELECT id FROM catalogo_atividade WHERE id = ${id} FOR UPDATE`;
}
