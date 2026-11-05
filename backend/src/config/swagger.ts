import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { CodigoErro, DESCRICAO_CODIGO_ERRO } from '../common/erros/codigos-erro';

const tabelaDeErros = () =>
  [
    '| codigo | quando |',
    '| --- | --- |',
    ...Object.values(CodigoErro).map(
      (codigo) => `| \`${codigo}\` | ${DESCRICAO_CODIGO_ERRO[codigo]} |`,
    ),
  ].join('\n');

/** Texto do topo do Swagger: as convencoes que valem para todas as rotas. */
const descricaoApi = () =>
  [
    'API REST do ViajaJunto - planejamento colaborativo de viagens.',
    '',
    '## Convencoes',
    '',
    '- **Versao:** todas as rotas ficam sob `/api/v1`. Mudancas incompativeis viram `/api/v2`.',
    '- **Autenticacao:** `POST /auth/login` devolve um `accessToken` (curto, 15 min por padrao) e um ' +
      '`refreshToken` (30 dias). Envie `Authorization: Bearer <accessToken>`; quando ele expirar (401 ' +
      '`NAO_AUTENTICADO`), troque o par em `POST /auth/refresh`. Cada refresh token vale uma vez.',
    '- **Datas:** dias sem horario em `aaaa-mm-dd`; instantes em ISO 8601 com fuso (`2027-01-11T14:30:00-03:00`).',
    '- **Dinheiro:** string com duas casas decimais (`"1250.50"`), para nao perder centavos.',
    '- **Paginacao:** `?pagina=1&limite=20` (limite maximo 100); resposta `{ itens, total, pagina, limite }`.',
    '- **PATCH:** envie so o que muda; `null` apaga um campo opcional.',
    '- **Limite:** 100 requisicoes por minuto por IP (login e cadastro tem limites menores); acima, 429.',
    '- **Rastreio:** toda resposta traz o header `X-Request-Id`; mande-o junto ao reportar um problema.',
    '',
    '## Erros',
    '',
    'Toda resposta de erro tem o mesmo corpo:',
    '',
    '```json',
    '{ "statusCode": 404, "codigo": "VIAGEM_NAO_ENCONTRADA", "mensagem": "Viagem nao encontrada",',
    '  "requestId": "6f1c...", "caminho": "/api/v1/viagens/X", "timestamp": "2027-01-10T12:00:00.000Z" }',
    '```',
    '',
    'Decida pelo `codigo`, nunca pelo texto da `mensagem`. Na validacao (400 `VALIDACAO`), `detalhes` ' +
      'lista os campos: `[{ "campo": "nome", "mensagens": ["..."] }]`.',
    '',
    tabelaDeErros(),
  ].join('\n');

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/**
 * `ViagensController.criar` vira `viagensCriar`: unico, em camelCase e legivel
 * nos clientes gerados a partir do contrato (orval, openapi-generator).
 */
export const gerarOperationId = (controller: string, metodo: string) => {
  const recurso = controller.replace(/Controller$/, '');
  return `${recurso.charAt(0).toLowerCase()}${recurso.slice(1)}${capitalizar(metodo)}`;
};

/**
 * Monta o documento OpenAPI. Separado do bootstrap para que o teste exercite
 * exatamente a configuracao que vai para o ar, e nao uma copia dela.
 */
export const criarDocumentoSwagger = (app: INestApplication): OpenAPIObject => {
  const urlPublica = app.get(ConfigService).get<string>('urlPublica')!;

  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('ViajaJunto API')
      .setDescription(descricaoApi())
      .setVersion('1.0.0')
      .setContact(
        'Equipe ViajaJunto',
        'https://github.com/carolinaadei/PUCRS-T2-CS',
        'carolina.g@edu.pucrs.br',
      )
      .setLicense('GPL-3.0', 'https://www.gnu.org/licenses/gpl-3.0.html')
      .addServer(urlPublica, 'Servidor desta instancia (PUBLIC_URL)')
      .addBearerAuth()
      // A ordem das tags e a ordem das secoes na pagina.
      .addTag('Autenticacao', 'Cadastro, login, renovacao de sessao e recuperacao de senha')
      .addTag('Usuarios', 'Perfil, senha, sessoes e exclusao da propria conta')
      .addTag('Viagens', 'Criar, listar, editar e excluir viagens')
      .addTag('Colaboracao', 'Convite por codigo, colaboradores e permissoes')
      .addTag('Destinos - Catalogo', 'Cidades cadastradas na plataforma')
      .addTag('Destinos - Viagem', 'Roteiro: destinos da viagem em ordem de visita')
      .addTag('Atividades - Catalogo', 'Catalogo publico de atividades')
      .addTag('Atividades - Viagem', 'Atividades agendadas nos destinos')
      .addTag('Orcamento', 'Orcamento da viagem e resumo financeiro')
      .addTag('Avaliacoes', 'Notas e comentarios das atividades')
      .addTag('Notificacoes', 'Avisos in-app de alteracoes nas viagens')
      .addTag('Uploads', 'Envio de fotos direto para o armazenamento')
      .addTag(
        'Lugares - Geoapify',
        'Busca de cidades e lugares; importacao com origem e atribuicao',
      )
      .addTag('Health', 'Monitoramento')
      .build(),
    { operationIdFactory: gerarOperationId },
  );
};

/** Publica a documentacao interativa em `<prefixo>/docs` (JSON em `<prefixo>/docs-json`). */
export const configurarSwagger = (app: INestApplication, prefixo: string): void => {
  SwaggerModule.setup(`${prefixo}/docs`, app, criarDocumentoSwagger(app), {
    swaggerOptions: { persistAuthorization: true },
  });
};
