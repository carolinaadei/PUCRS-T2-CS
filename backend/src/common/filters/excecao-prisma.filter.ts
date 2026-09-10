import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Traduz erros conhecidos do Prisma em respostas HTTP com significado,
 * evitando vazar detalhes internos do banco para o cliente.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class ExcecaoPrismaFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExcecaoPrismaFilter.name);

  catch(excecao: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();

    switch (excecao.code) {
      // Violacao de restricao UNIQUE
      case 'P2002': {
        const campos = (excecao.meta?.target as string[] | undefined)?.join(', ');
        const erro = new ConflictException(
          campos ? `Ja existe um registro com este valor em: ${campos}` : 'Registro duplicado',
        );
        return resposta.status(erro.getStatus()).json(erro.getResponse());
      }

      // Registro relacionado nao encontrado / violacao de FK
      case 'P2003':
      case 'P2025': {
        const erro = new NotFoundException('Registro relacionado nao encontrado');
        return resposta.status(erro.getStatus()).json(erro.getResponse());
      }

      default: {
        this.logger.error(`Erro Prisma nao tratado (${excecao.code}): ${excecao.message}`);
        return resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Erro interno ao acessar o banco de dados',
        });
      }
    }
  }
}
