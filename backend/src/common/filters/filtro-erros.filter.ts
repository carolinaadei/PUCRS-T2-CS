import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { CodigoErro } from '../erros/codigos-erro';
import { CorpoErro } from '../erros/erros';
import { RequisicaoComId } from '../http/request-id';

interface ErroTraduzido {
  status: number;
  codigo: CodigoErro;
  mensagem: string;
  detalhes?: unknown;
}

/** Codigo usado quando a excecao nao traz um (veio do framework, nao do nosso codigo). */
const CODIGO_POR_STATUS: Partial<Record<number, CodigoErro>> = {
  400: CodigoErro.VALIDACAO,
  401: CodigoErro.NAO_AUTENTICADO,
  403: CodigoErro.PROIBIDO,
  404: CodigoErro.NAO_ENCONTRADO,
  409: CodigoErro.CONFLITO,
  413: CodigoErro.CORPO_GRANDE_DEMAIS,
  429: CodigoErro.MUITAS_REQUISICOES,
  503: CodigoErro.SERVICO_INDISPONIVEL,
};

/** As mensagens do framework vem em ingles; estas as substituem. */
const MENSAGEM_POR_STATUS: Partial<Record<number, string>> = {
  400: 'Requisicao invalida',
  401: 'Token de acesso ausente, invalido ou expirado',
  403: 'Voce nao tem permissao para esta operacao',
  404: 'Recurso nao encontrado',
  409: 'A operacao conflita com o estado atual do recurso',
  413: 'O corpo da requisicao passou do limite permitido',
  429: 'Muitas requisicoes; aguarde um pouco e tente novamente',
  503: 'Servico temporariamente indisponivel',
};

/** Erros que o body-parser do Express lanca antes de a requisicao chegar ao Nest. */
interface ErroBodyParser {
  type?: string;
  status?: number;
}

const ehCorpoErro = (valor: unknown): valor is CorpoErro =>
  typeof valor === 'object' && valor !== null && 'codigo' in valor && 'message' in valor;

/**
 * Formato unico de erro da API. Toda resposta >= 400 sai daqui, com o mesmo corpo:
 *
 *   { statusCode, codigo, mensagem, detalhes?, requestId, caminho, timestamp }
 *
 * O `codigo` e estavel e e por ele que um cliente decide o que fazer. Erros do
 * banco sao traduzidos sem expor nomes de tabela ou coluna; falhas inesperadas
 * viram 500 generico, e o detalhe fica so no log, ligado pelo `requestId`.
 */
@Catch()
export class FiltroErros implements ExceptionFilter {
  private readonly logger = new Logger(FiltroErros.name);

  catch(excecao: unknown, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const requisicao = contexto.getRequest<Request & RequisicaoComId>();
    const resposta = contexto.getResponse<Response>();

    const erro = this.traduzir(excecao, requisicao);

    if (erro.status >= 500) {
      const detalhe =
        excecao instanceof Error ? (excecao.stack ?? excecao.message) : String(excecao);
      this.logger.error(
        `[${requisicao.id ?? '-'}] ${requisicao.method} ${requisicao.originalUrl}: ${detalhe}`,
      );
    }

    resposta.status(erro.status).json({
      statusCode: erro.status,
      codigo: erro.codigo,
      mensagem: erro.mensagem,
      ...(erro.detalhes !== undefined && { detalhes: erro.detalhes }),
      requestId: requisicao.id,
      caminho: requisicao.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private traduzir(excecao: unknown, requisicao: Request): ErroTraduzido {
    if (excecao instanceof HttpException) {
      return this.traduzirHttp(excecao, requisicao);
    }

    if (excecao instanceof Prisma.PrismaClientKnownRequestError) {
      return this.traduzirPrisma(excecao);
    }

    const bodyParser = excecao as ErroBodyParser;
    if (bodyParser?.type === 'entity.too.large') {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        codigo: CodigoErro.CORPO_GRANDE_DEMAIS,
        mensagem: MENSAGEM_POR_STATUS[413]!,
      };
    }
    if (bodyParser?.type === 'entity.parse.failed') {
      return {
        status: HttpStatus.BAD_REQUEST,
        codigo: CodigoErro.JSON_INVALIDO,
        mensagem: 'O corpo da requisicao nao e um JSON valido',
      };
    }

    return this.erroInterno();
  }

  private traduzirHttp(excecao: HttpException, requisicao: Request): ErroTraduzido {
    const status = excecao.getStatus();
    const corpo = excecao.getResponse();

    if (ehCorpoErro(corpo)) {
      return { status, codigo: corpo.codigo, mensagem: corpo.message, detalhes: corpo.detalhes };
    }

    // O roteador do Nest responde rota inexistente com "Cannot GET /caminho".
    if (status === HttpStatus.NOT_FOUND && excecao.message.startsWith('Cannot ')) {
      return {
        status,
        codigo: CodigoErro.ROTA_NAO_ENCONTRADA,
        mensagem: `Rota nao encontrada: ${requisicao.method} ${requisicao.originalUrl.split('?')[0]}`,
      };
    }

    // O Nest converte a falha do JSON.parse do body-parser num 400 com a
    // mensagem do SyntaxError ("Unexpected end of JSON input", "... in JSON at ...").
    if (status === HttpStatus.BAD_REQUEST && /JSON/.test(excecao.message)) {
      return {
        status,
        codigo: CodigoErro.JSON_INVALIDO,
        mensagem: 'O corpo da requisicao nao e um JSON valido',
      };
    }

    if (status >= 500) {
      return this.erroInterno();
    }

    return {
      status,
      codigo: CODIGO_POR_STATUS[status] ?? CodigoErro.VALIDACAO,
      mensagem: MENSAGEM_POR_STATUS[status] ?? 'Requisicao invalida',
    };
  }

  private traduzirPrisma(excecao: Prisma.PrismaClientKnownRequestError): ErroTraduzido {
    switch (excecao.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          codigo: CodigoErro.REGISTRO_DUPLICADO,
          mensagem: 'Ja existe um registro com estes dados',
        };
      // Chave estrangeira: aqui so chega a remocao de um registro ainda
      // referenciado, porque as criacoes conferem as referencias antes.
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          codigo: CodigoErro.REGISTRO_EM_USO,
          mensagem: 'O registro esta em uso por outros dados e nao pode ser alterado',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          codigo: CodigoErro.NAO_ENCONTRADO,
          mensagem: MENSAGEM_POR_STATUS[404]!,
        };
      default:
        return this.erroInterno();
    }
  }

  private erroInterno(): ErroTraduzido {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      codigo: CodigoErro.ERRO_INTERNO,
      mensagem: 'Erro interno; tente novamente em instantes',
    };
  }
}
