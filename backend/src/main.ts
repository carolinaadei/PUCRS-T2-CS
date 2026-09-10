import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ExcecaoPrismaFilter } from './common/filters/excecao-prisma.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const porta = config.get<number>('porta')!;
  const prefixo = config.get<string>('prefixoApi')!;

  app.setGlobalPrefix(prefixo);
  app.use(helmet());
  app.enableCors({ origin: config.get<string>('corsOrigin'), credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos nao declarados nos DTOs
      forbidNonWhitelisted: true, // e rejeita a requisicao se houver algum
      transform: true, // converte payloads em instancias dos DTOs
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new ExcecaoPrismaFilter());

  // Documentacao interativa da API (apoia a testabilidade citada na Secao 7 da arquitetura)
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ViajaJunto API')
      .setDescription('API REST do ViajaJunto - planejamento colaborativo de viagens')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(`${prefixo}/docs`, app, documento);

  await app.listen(porta);

  const logger = new Logger('Bootstrap');
  logger.log(`API em http://localhost:${porta}/${prefixo}`);
  logger.log(`Swagger em http://localhost:${porta}/${prefixo}/docs`);
}

void bootstrap();
