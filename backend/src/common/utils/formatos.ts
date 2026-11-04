import { Prisma } from '@prisma/client';
import { CodigoErro } from '../erros/codigos-erro';
import { requisicaoInvalida } from '../erros/erros';

/** Formato aceito e devolvido para datas sem horario. */
export const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Dia (aaaa-mm-dd) de uma coluna DATE, que o Prisma entrega a meia-noite UTC. */
export const paraDia = (data: Date | null | undefined): string | null =>
  data ? data.toISOString().slice(0, 10) : null;

/**
 * Converte aaaa-mm-dd em meia-noite UTC: o dia gravado na coluna DATE e sempre o
 * informado, qualquer que seja o fuso do servidor. Recusa dias inexistentes
 * (2027-02-31), que o `Date` normalizaria em silencio para marco.
 */
export function deDia(valor: string, campo: string): Date {
  const data = new Date(`${valor}T00:00:00.000Z`);

  if (!FORMATO_DIA.test(valor) || Number.isNaN(data.getTime()) || paraDia(data) !== valor) {
    throw requisicaoInvalida(
      CodigoErro.DATA_INEXISTENTE,
      `A data ${valor} (${campo}) nao existe no calendario`,
    );
  }

  return data;
}

/**
 * Valor monetario sempre como string com duas casas ("1250.50"): numero em
 * ponto flutuante perde centavos, e o formato fixo evita "1250.5" num lugar e
 * "1250.50" em outro.
 */
export const paraDinheiro = (valor: Prisma.Decimal | number | null | undefined): string | null =>
  valor === null || valor === undefined ? null : new Prisma.Decimal(valor).toFixed(2);
