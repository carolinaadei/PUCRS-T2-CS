# ViajaJunto — Backend

API REST do ViajaJunto, aplicação web de planejamento colaborativo de viagens.
Foi feita para ser consumida por qualquer front: contrato OpenAPI completo,
versionado (`/api/v1`), com formato de erro único e códigos estáveis.

## Stack

| Camada | Tecnologia |
| ------ | ---------- |
| Linguagem | TypeScript |
| Framework | NestJS 11 |
| Banco de dados | PostgreSQL 16 + Prisma 6 |
| Autenticação | JWT de acesso curto + refresh token rotativo, senha com bcryptjs |
| Serviços AWS | S3 (fotos), SQS (fila de e-mails), SES (e-mail), Secrets Manager e SSM (configuração) |
| Infraestrutura como código | CloudFormation, aplicado no [MiniStack](https://ministack.org) pelo Docker Compose |
| Documentação da API | Swagger (OpenAPI 3) |
| Testes | Jest + Supertest, com integração contra Postgres e MiniStack reais |

## Como rodar

### Tudo pelo Docker (recomendado)

Na **raiz do repositório**:

```bash
docker compose up -d --build --wait
```

Sobe Postgres, MiniStack, aplica a pilha CloudFormation, roda migrations e seed,
e inicia a API e o worker de e-mails. Pronto em:

- API: `http://localhost:3000/api/v1`
- Swagger: **`http://localhost:3000/api/docs`** (JSON em `/api/docs-json`)
- E-mails enviados: `http://localhost:4566/_ministack/ses/messages`

O seed cria `ana.souza@example.com` e `bruno.lima@example.com` (senha
`senha12345`), a viagem `DEMO2027` (convite `EURO2027`) e a viagem concluída
`DEMO2026`. Como a infraestrutura funciona está em
[docs/infra-ministack.md](../docs/infra-ministack.md).

Portas ocupadas? Defina `POSTGRES_PORT`, `API_PORT` ou `MINISTACK_PORT` num `.env`
na raiz (e `COMPOSE_PROJECT_NAME` para isolar cópias do repositório).

### API no host, com hot reload

```bash
cd backend
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run db:up                 # so o Postgres do compose
npm run prisma:migrate        # cria as tabelas
npm run prisma:seed           # (opcional) dados de demonstracao
npm run start:dev
```

Sem MiniStack, os e-mails saem no terminal (`MAIL_PROVEDOR=log`) e o upload de
fotos responde `503 UPLOAD_INDISPONIVEL`. Para usá-los, `npm run infra:up` e
descomente o bloco AWS do `.env`.

## Scripts

| Comando | O que faz |
| ------- | --------- |
| `npm run start:dev` | API em modo watch |
| `npm run start:worker` | Worker que entrega os e-mails da fila SQS |
| `npm run build` | Compila para `dist/` |
| `npm run lint` / `lint:ci` | ESLint + Prettier (com correção / sem warnings) |
| `npm test` / `test:cov` | Testes unitários |
| `npm run test:e2e` | E2E; as suítes de integração rodam se houver `DATABASE_URL_TESTE` (e `MINISTACK_TESTE`) |
| `npm run test:integracao` | Só as suítes de integração |
| `npm run db:up` / `db:down` | Sobe/para o Postgres do compose |
| `npm run infra:up` | Sobe o MiniStack e aplica a pilha CloudFormation |
| `npm run prisma:migrate` / `prisma:seed` / `prisma:studio` | Banco |
| `npm run openapi:gerar` | Escreve `openapi.json` a partir dos decorators |

## Convenções da API

- **Versão:** tudo sob `/api/v1`; as sondas ficam fora (`/api/health/live` e `/api/health/ready`).
- **Autenticação:** `POST /auth/login` devolve `accessToken` (15 min) e `refreshToken` (30 dias).
  Quando o access expira (401), troque o par em `POST /auth/refresh`; cada refresh token vale uma vez.
- **Erros:** sempre `{ statusCode, codigo, mensagem, detalhes?, requestId, caminho, timestamp }`.
  Decida pelo `codigo` (a tabela completa está no topo do Swagger).
- **Datas:** dias em `aaaa-mm-dd`; instantes em ISO 8601 com fuso.
- **Dinheiro:** string com duas casas (`"1250.50"`).
- **PATCH:** envie só o que muda; `null` apaga campo opcional.
- **Paginação:** `?pagina=&limite=` (máx. 100) → `{ itens, total, pagina, limite }`.
- **Rastreio:** header `X-Request-Id` em toda resposta.
- **Limites:** 100 req/min por IP; login 10 a cada 15 min; cadastro 10 por hora.

## Controle de acesso

O `JwtAuthGuard` é global: toda rota exige token, salvo as marcadas com
`@Publico()` (catálogos, avaliações públicas, health). O acesso a uma viagem é
feito pelo `AcessoViagemGuard` com `@NivelAcesso()`:

| Nível | Quem passa | Erro para quem não passa |
| ----- | ---------- | ------------------------ |
| `MEMBRO` | criador ou qualquer colaborador | 404 `VIAGEM_NAO_ENCONTRADA` |
| `EDITOR` | criador ou colaborador `EDITOR` | 403 `SOMENTE_LEITURA` |
| `CRIADOR` | só o criador | 403 `APENAS_CRIADOR` |

Quem não participa recebe 404, e não 403: a API não revela que a viagem existe.

## Rotas

Todas sob `/api/v1` (exceto health). Detalhes, exemplos e erros no Swagger.

| Método | Rota | Requisito | Acesso |
| ------ | ---- | --------- | ------ |
| `POST` | `/auth/registrar` | RF01 | Público |
| `POST` | `/auth/login` | RF02 | Público |
| `POST` | `/auth/refresh` | RF02 | Público |
| `POST` | `/auth/logout` | RF02 | Autenticado |
| `POST` | `/auth/recuperar-senha` · `/auth/verificar-codigo` · `/auth/redefinir-senha` | RF03 | Público |
| `GET` · `PATCH` | `/usuarios/eu` | — | Autenticado |
| `PUT` | `/usuarios/eu/senha` | RF02 | Autenticado |
| `DELETE` | `/usuarios/eu/sessoes` | RF02 | Autenticado |
| `POST` | `/usuarios/eu/exclusao` | — | Autenticado |
| `GET` | `/usuarios/eu/paises-visitados` | RF11 | Autenticado |
| `POST` · `GET` | `/viagens` | RF04, RF06 | Autenticado |
| `GET` | `/viagens/:viagemId` | RN06 | Membro |
| `PATCH` | `/viagens/:viagemId` | RF05, RF07 | Editor |
| `DELETE` | `/viagens/:viagemId` | RF05 | Criador |
| `GET` | `/convites/:codigo` | RF18 | Autenticado |
| `POST` | `/convites/:codigo/aceitar` | RF18 | Autenticado |
| `POST` | `/viagens/:viagemId/convite` | RF18 | Criador |
| `GET` | `/viagens/:viagemId/membros` | RF19 | Membro |
| `PATCH` · `DELETE` | `/viagens/:viagemId/membros/:membroId` | RF20 | Criador |
| `DELETE` | `/viagens/:viagemId/membros/eu` | — | Membro |
| `GET` · `POST` | `/destinos` | RF09, RF10 | Público · Autenticado |
| `GET` | `/destinos/destaques` | RF25 | Público |
| `GET` · `PATCH` · `DELETE` | `/destinos/:id` | RF09 | Público · Quem cadastrou |
| `GET` · `POST` | `/viagens/:viagemId/destinos` | RF08 | Membro · Editor |
| `PUT` | `/viagens/:viagemId/destinos/ordem` | RF08 | Editor |
| `PATCH` · `DELETE` | `/viagens/:viagemId/destinos/:destinoId` | RF08 | Editor |
| `GET` · `POST` | `/atividades` | RF24, RF12 | Público · Autenticado |
| `GET` | `/atividades/destaques` | RF25 | Público |
| `GET` · `PATCH` · `DELETE` | `/atividades/:id` | RF23 | Público · Quem cadastrou |
| `GET` · `POST` | `/viagens/:viagemId/atividades` | RF14, RF12, RF13 | Membro · Editor |
| `PATCH` · `DELETE` | `/viagens/:viagemId/atividades/:atividadeId` | RF13 | Editor |
| `GET` · `PUT` · `DELETE` | `/viagens/:viagemId/orcamento` | RF15, RF16 | Membro · Editor |
| `GET` | `/viagens/:viagemId/orcamento/resumo` | RF17 | Membro |
| `GET` | `/atividades/:atividadeId/avaliacoes` | RF23 | Público |
| `GET` · `PUT` · `DELETE` | `/atividades/:atividadeId/avaliacoes/minha` | RF22 | Autenticado |
| `GET` | `/notificacoes` · `/notificacoes/contagem` | RF21 | Autenticado |
| `PATCH` | `/notificacoes/:notificacaoId` | RF21 | Autenticado |
| `POST` | `/notificacoes/marcar-como-lidas` | RF21 | Autenticado |
| `POST` | `/uploads` | RF09, RF13 | Autenticado |
| `GET` | `/api/health/live` · `/api/health/ready` | — | Público |

## Organização do código

```
backend/
├── prisma/                    # schema (DER), migrations e seed
├── scripts/gerar-openapi.ts   # exporta o contrato para o Spectral do CI
├── test/
│   ├── apoio/                 # sobe a app como em producao, banco e e-mails de teste
│   ├── integracao/            # suites contra Postgres e MiniStack reais
│   └── *.e2e-spec.ts          # convencoes HTTP, acesso, limites e contrato
└── src/
    ├── main.ts                # le a configuracao da AWS e sobe a API
    ├── worker.ts              # processo que entrega os e-mails da fila
    ├── config/                # ambiente, configuracao da AWS, Swagger, setup HTTP
    ├── aws/                   # S3 (upload assinado) e SQS (fila de e-mails)
    ├── common/                # erros, filtro, pipes, guards, decorators
    ├── prisma/                # PrismaService e travas de linha
    └── modules/               # um modulo por area do Documento de Requisitos
```

Cada módulo tem `*.controller.ts` (rotas), `*.service.ts` (regra de negócio),
`*.mapper.ts` (entidade do banco → resposta da API) e `dto/` (contratos).
As respostas nunca são entidades do Prisma: uma coluna nova no banco não muda o contrato.

## Decisões

1. **Convite separado do id da viagem** (`codigo_convite`), 8 caracteres sem `0/O/1/I`.
   O criador gera outro a qualquer momento e o anterior deixa de valer.
2. **Quem entra pelo convite começa como `VISUALIZADOR`**; o criador promove a `EDITOR`.
3. **Uma avaliação por usuário por atividade**, e só de quem tem a atividade (ou a
   viagem) `CONCLUIDA` numa viagem de que participa.
4. **Campos derivados** (`orcamento.previsto_atividades`, `catalogo_atividade.media_avaliacao`)
   são recalculados na mesma transação da escrita, com a linha travada (`FOR UPDATE`).
5. **Notificações** ficam no banco e são gravadas na mesma transação da alteração;
   quem fez a alteração não é notificado.
6. **Ordem do roteiro** sempre `0..n-1`, sem repetição: inserir, mover ou remover
   reorganiza os demais.
7. **Itens do catálogo têm dono** (`criado_por`): só quem cadastrou edita ou exclui,
   e só se ninguém mais depende deles.
8. **E-mail fora da requisição:** a API publica na fila SQS e o worker entrega;
   falhas são tentadas de novo e, na terceira, vão para a DLQ.
9. **`bcryptjs` no lugar de `bcrypt`**: mesma API, sem compilação nativa no Windows.

## Pendências

- **Google Places API** — o catálogo já tem `google_place_id` e `fonte`, mas a importação
  automática de locais (Seção 2 da arquitetura) ainda não foi implementada.
- **Rate limit compartilhado** — o contador fica em memória; com mais de uma instância
  da API, troque o storage do Throttler por Redis.

## Contribuindo

Siga o [CONTRIBUTING.md](../CONTRIBUTING.md): branches partem da `dev`, e o merge
passa pelos portões do CI descritos em [docs/pipeline.md](../docs/pipeline.md).
