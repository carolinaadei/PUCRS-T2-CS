import { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

/** Colisao de codigo e improvavel, mas nao impossivel: tenta outros antes de desistir. */
const TENTATIVAS_DE_CODIGO = 5;

/** Alfabeto sem caracteres ambiguos (0/O, 1/I) para o codigo ser ditado sem erro. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 8 caracteres de 32 simbolos: ~1,1 trilhao de combinacoes, gerados pelo CSPRNG. */
export const TAMANHO_CODIGO = 8;

export function gerarCodigo(tamanho = TAMANHO_CODIGO): string {
  let codigo = '';

  for (let i = 0; i < tamanho; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }

  return codigo;
}

/** O usuario pode digitar o codigo em minusculas ou com espacos. */
export const normalizarCodigo = (codigo: string) => codigo.trim().toUpperCase();

/**
 * Executa uma escrita que grava codigos gerados por `gerarCodigo` e a repete,
 * com codigos novos, enquanto um deles colidir com um existente (P2002).
 */
export async function comCodigoUnico<T>(escrita: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await escrita();
    } catch (erro) {
      const colidiu = erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';

      if (!colidiu || tentativa >= TENTATIVAS_DE_CODIGO) {
        throw erro;
      }
    }
  }
}
