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
  app.enableShutdownHooks();

  await app.get(ConsumidorEmails).executar();
  await app.close();
}

void iniciar();
