import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { carregarConfiguracaoDaAws } from './config/configuracao-aws';
import { criarLogger } from './config/logger';

/**
 * Processo separado da API que entrega os e-mails da fila SQS. Mesma imagem
 * Docker, outro comando: `node dist/worker`.
 */
async function iniciar() {
  const logger = criarLogger();
  Logger.overrideLogger(logger);

  await carregarConfiguracaoDaAws();

  const { WorkerModule } = await import('./worker/worker.module');
  const { ConsumidorEmails } = await import('./worker/consumidor-emails');

  const app = await NestFactory.createApplicationContext(WorkerModule, { logger });
  // No SIGTERM o Nest roda os hooks (o consumidor termina o ciclo em curso) e
  // encerra o processo; o loop abaixo so para por esse caminho.
  app.enableShutdownHooks();

  await app.get(ConsumidorEmails).executar();
}

void iniciar();
