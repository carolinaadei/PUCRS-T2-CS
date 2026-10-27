import { ValidationPipe } from '@nestjs/common';

/** Pipe de validacao da aplicacao. Usado no bootstrap e nos testes e2e, para
 * que ambos exercitem exatamente a mesma configuracao. */
export const criarPipeValidacao = () =>
  new ValidationPipe({
    whitelist: true, // remove campos nao declarados nos DTOs
    forbidNonWhitelisted: true, // e rejeita a requisicao se houver algum
    transform: true, // converte payloads em instancias dos DTOs
    transformOptions: { enableImplicitConversion: true },
  });
