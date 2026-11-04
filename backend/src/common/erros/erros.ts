import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CodigoErro } from './codigos-erro';

/**
 * Corpo que acompanha as excecoes de negocio ate o FiltroErros.
 *
 * A chave `message` e a que o Nest usa para preencher `error.message` - e o que
 * faz `toThrow('texto')` funcionar nos testes. Na resposta HTTP ela sai como
 * `mensagem`.
 */
export interface CorpoErro {
  codigo: CodigoErro;
  message: string;
  detalhes?: unknown;
}

const corpo = (codigo: CodigoErro, message: string, detalhes?: unknown): CorpoErro =>
  detalhes === undefined ? { codigo, message } : { codigo, message, detalhes };

export const requisicaoInvalida = (codigo: CodigoErro, mensagem: string, detalhes?: unknown) =>
  new BadRequestException(corpo(codigo, mensagem, detalhes));

export const naoAutenticado = (codigo: CodigoErro, mensagem: string) =>
  new UnauthorizedException(corpo(codigo, mensagem));

export const proibido = (codigo: CodigoErro, mensagem: string) =>
  new ForbiddenException(corpo(codigo, mensagem));

export const naoEncontrado = (codigo: CodigoErro, mensagem: string) =>
  new NotFoundException(corpo(codigo, mensagem));

export const conflito = (codigo: CodigoErro, mensagem: string) =>
  new ConflictException(corpo(codigo, mensagem));

export const indisponivel = (codigo: CodigoErro, mensagem: string) =>
  new ServiceUnavailableException(corpo(codigo, mensagem));
