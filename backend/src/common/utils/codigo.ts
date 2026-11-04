import { randomInt } from 'node:crypto';

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
