import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ExcecaoPrismaFilter } from './common/filters/excecao-prisma.filter';
import { padroesDeDesenvolvimentoEmUso } from './config/validacao-env';
import { criarPipeValidacao } from './common/pipes/pipe-validacao';

/** Texto do topo do Swagger: as convencoes que valem para todas as rotas. */
const DESCRICAO_API = [
  'API REST do ViajaJunto - planejamento colaborativo de viagens.',
  '',
  '- **Autenticacao:** rotas com cadeado exigem `Authorization: Bearer <token>`, obtido em `POST /auth/login`.',
  '- **Erros:** corpo `{ statusCode, message, error }`; na validacao (400), `message` e uma lista.',
  '- **Valores monetarios** (Decimal) chegam como string, ex.: `"250.5"`.',
  '- **Limite:** 100 requisicoes por minuto por IP; acima disso, 429.',
  '- **(nao implementado):** contrato ja definido, mas a rota ainda responde 501.',
].join('\n');

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
  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ViajaJunto API')
      .setDescription(DESCRICAO_API)
      .setVersion('0.1.0')
      .addBearerAuth()
      // A ordem das tags e a ordem das secoes na pagina.
      .addTag('Autenticacao', 'Cadastro, login e recuperacao de senha (RF01 a RF03)')
      .addTag('Usuarios', 'Perfil do usuario autenticado')
      .addTag('Viagens', 'Criacao, painel pessoal e edicao de viagens (RF04 a RF07)')
      .addTag('Destinos - Catalogo', 'Cidades cadastradas na plataforma (RF09, RF10)')
      .addTag('Destinos - Viagem', 'Roteiro: destinos da viagem em ordem de visita (RF08)')
      .addTag('Atividades - Catalogo', 'Catalogo publico de atividades (RF23 a RF25)')
      .addTag('Atividades - Viagem', 'Atividades agendadas nos destinos (RF12 a RF14)')
      .addTag('Orcamento', 'Orcamento e resumo financeiro (RF15 a RF17)')
      .addTag('Colaboracao', 'Convite por codigo e permissoes (RF18 a RF20)')
      .addTag('Notificacoes', 'Avisos in-app de alteracoes na viagem (RF21)')
      .addTag('Avaliacoes', 'Notas e comentarios das atividades (RF22, RF23)')
      .addTag('Health', 'Monitoramento')
      .build(),
  );
  SwaggerModule.setup(`${prefixo}/docs`, app, documento);

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
