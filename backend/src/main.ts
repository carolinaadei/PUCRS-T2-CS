import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { configurarAplicacao } from './config/aplicacao';
import { carregarConfiguracaoDaAws } from './config/configuracao-aws';
import { criarLogger } from './config/logger';
import { configurarSwagger } from './config/swagger';
import { padroesDeDesenvolvimentoEmUso } from './config/validacao-env';

async function bootstrap() {
  // O mesmo formato de log ja na leitura da configuracao, antes de o Nest subir.
  const consoleLogger = criarLogger();
  Logger.overrideLogger(consoleLogger);
  const logger = new Logger('Bootstrap');

  // Precisa vir antes do import do AppModule: o ConfigModule valida o ambiente
  // assim que o modulo e carregado, e os segredos podem estar so na AWS.
  await carregarConfiguracaoDaAws();
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: consoleLogger,
  });
  const config = app.get(ConfigService);

  configurarAplicacao(app);
  // SIGTERM (docker stop, deploy) espera as requisicoes em curso e fecha o banco.
  app.enableShutdownHooks();

  const prefixo = config.get<string>('prefixoApi')!;
  configurarSwagger(app, prefixo);

  await app.listen(config.get<number>('porta')!);

  const padroes = padroesDeDesenvolvimentoEmUso();
  if (padroes.length > 0) {
    logger.warn(
      `Usando padroes de desenvolvimento para: ${padroes.join(', ')}. ` +
        'Em producao estas variaveis sao obrigatorias.',
    );
  }

  const url = config.get<string>('urlPublica')!;
  logger.log(`API em ${url}/${prefixo}/v1`);
  logger.log(`Swagger em ${url}/${prefixo}/docs`);
}

void bootstrap();
