import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

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

/**
 * Monta o documento OpenAPI. Separado do bootstrap para que o teste exercite
 * exatamente a configuracao que vai para o ar, e nao uma copia dela.
 */
export const criarDocumentoSwagger = (app: INestApplication): OpenAPIObject =>
  SwaggerModule.createDocument(
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

/** Publica a documentacao interativa em `<prefixo>/docs`. */
export const configurarSwagger = (app: INestApplication, prefixo: string): void => {
  SwaggerModule.setup(`${prefixo}/docs`, app, criarDocumentoSwagger(app));
};
