import { ValidationError, ValidationPipe } from '@nestjs/common';
import { CodigoErro } from '../erros/codigos-erro';
import { requisicaoInvalida } from '../erros/erros';

export interface ErroDeCampo {
  campo: string;
  mensagens: string[];
}

/**
 * Achata a arvore do class-validator numa lista por campo, com o caminho
 * completo (`destinos.0.nome`). A mensagem de campo nao declarado vem em ingles
 * do proprio class-validator e e reescrita aqui.
 */
export function achatarErros(erros: ValidationError[], prefixo = ''): ErroDeCampo[] {
  return erros.flatMap((erro) => {
    const campo = prefixo ? `${prefixo}.${erro.property}` : erro.property;
    const restricoes = erro.constraints ?? {};

    const mensagens = Object.entries(restricoes).map(([regra, mensagem]) =>
      regra === 'whitelistValidation' ? `O campo ${campo} nao e permitido` : mensagem,
    );

    const proprios = mensagens.length > 0 ? [{ campo, mensagens }] : [];
    return [...proprios, ...achatarErros(erro.children ?? [], campo)];
  });
}

/** Pipe de validacao da aplicacao. Usado no bootstrap e nos testes. */
export const criarPipeValidacao = () =>
  new ValidationPipe({
    whitelist: true, // remove campos nao declarados nos DTOs
    forbidNonWhitelisted: true, // e rejeita a requisicao se houver algum
    transform: true, // converte payloads em instancias dos DTOs
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (erros) =>
      requisicaoInvalida(CodigoErro.VALIDACAO, 'Dados invalidos', achatarErros(erros)),
  });
