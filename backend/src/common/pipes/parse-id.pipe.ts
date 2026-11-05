import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { CodigoErro } from '../erros/codigos-erro';
import { requisicaoInvalida } from '../erros/erros';

/** Maior valor de uma coluna SERIAL (int4) do Postgres. */
const MAIOR_ID = 2_147_483_647;

function converterId(valor: string | undefined, metadados: ArgumentMetadata): number {
  const numero = Number(valor);

  if (!/^\d+$/.test(valor ?? '') || numero < 1 || numero > MAIOR_ID) {
    throw requisicaoInvalida(
      CodigoErro.ID_INVALIDO,
      `O parametro ${metadados.data ?? 'id'} deve ser um numero inteiro positivo`,
    );
  }

  return numero;
}

/**
 * Converte um id numerico de rota. Diferente do ParseIntPipe do Nest, recusa
 * zero, negativos e valores que estouram o int4 - que chegariam ao banco como
 * erro 500 - e responde em portugues, no formato padrao de erro.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string | undefined, number> {
  transform(valor: string | undefined, metadados: ArgumentMetadata): number {
    return converterId(valor, metadados);
  }
}

/** Mesma regra, para um id opcional de query string: ausente vira `undefined`. */
@Injectable()
export class ParseIdOpcionalPipe implements PipeTransform<string | undefined, number | undefined> {
  transform(valor: string | undefined, metadados: ArgumentMetadata): number | undefined {
    return valor === undefined || valor === '' ? undefined : converterId(valor, metadados);
  }
}
