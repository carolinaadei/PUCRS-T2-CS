import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ExcecaoPrismaFilter } from './common/filters/excecao-prisma.filter';
import { configurarSwagger } from './config/swagger';
import { padroesDeDesenvolvimentoEmUso } from './config/validacao-env';
import { criarPipeValidacao } from './common/pipes/pipe-validacao';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const porta = config.get<number>('porta')!;
  const prefixo = config.get<string>('prefixoApi')!;

  app.setGlobalPrefix(prefixo);
  app.use(helmet());

  const origem = config.get<string>('corsOrigin')!;
  app.enableCors({ origin: origem, credentials: origem !== '*' });

  app.useGlobalPipes(criarPipeValidacao());

  app.useGlobalFilters(new ExcecaoPrismaFilter());

  // Documentacao interativa da API (apoia a testabilidade citada na Secao 7 da arquitetura)
  configurarSwagger(app, prefixo);

  await app.listen(porta);

  const logger = new Logger('Bootstrap');

  const padroes = padroesDeDesenvolvimentoEmUso();
  if (padroes.length > 0) {
    logger.warn(
      `Sem configuracao para: ${padroes.join(', ')}. ` +
        'Usando padroes de desenvolvimento - o envio de e-mail nao funciona e o ' +
        'codigo do RF03 sai no log. Em producao estas variaveis sao obrigatorias.',
    );
  }

  logger.log(`API em http://localhost:${porta}/${prefixo}`);
  logger.log(`Swagger em http://localhost:${porta}/${prefixo}/docs`);
}

void bootstrap();
