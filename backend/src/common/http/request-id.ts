import { Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export interface RequisicaoComId {
  id?: string;
}

/** Aceita o id do cliente (ou de um proxy) so se for curto e sem caracteres estranhos. */
const ID_ACEITAVEL = /^[\w-]{8,128}$/;

/**
 * Da a cada requisicao um id, devolvido no header `X-Request-Id` e no corpo dos
 * erros. E o que liga a reclamacao de um usuario a linha certa do log.
 */
export function atribuirRequestId(
  requisicao: Request & RequisicaoComId,
  resposta: Response,
  proximo: NextFunction,
) {
  const recebido = requisicao.header('x-request-id');
  requisicao.id = recebido && ID_ACEITAVEL.test(recebido) ? recebido : randomUUID();
  resposta.setHeader('X-Request-Id', requisicao.id);
  proximo();
}

const logger = new Logger('HTTP');

/**
 * Log de acesso: uma linha por requisicao, com status e duracao. Fica num
 * middleware, e nao num interceptor, porque so assim pega tambem as respostas
 * que nunca chegam ao controller - 401 do guard, 404 de rota, 429 do throttler.
 */
export function registrarAcesso(
  requisicao: Request & RequisicaoComId,
  resposta: Response,
  proximo: NextFunction,
) {
  const inicio = process.hrtime.bigint();

  resposta.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicio) / 1_000_000;
    const linha = `${requisicao.method} ${requisicao.originalUrl} ${resposta.statusCode} ${ms.toFixed(1)}ms [${requisicao.id ?? '-'}]`;

    if (resposta.statusCode >= 500) {
      logger.error(linha);
    } else if (resposta.statusCode >= 400) {
      logger.warn(linha);
    } else {
      logger.log(linha);
    }
  });

  proximo();
}
