# ViajaJunto — Backend

API REST do ViajaJunto, aplicação web de planejamento colaborativo de viagens.

Implementa a **Camada de Negócio** descrita na Seção 4.1 do [Documento de Arquitetura](../docs/architecture.md): regras de negócio, autenticação, controle de permissões e persistência.

## Stack

| Camada | Tecnologia |
| ------ | ---------- |
| Linguagem | TypeScript |
| Framework | NestJS 11 |
| Banco de dados | PostgreSQL 16 |
| ORM | Prisma 6 |
| Autenticação | JWT (Passport) + hash de senha com bcryptjs |
| Documentação da API | Swagger (OpenAPI) |
| Testes | Jest + Supertest |

## Pré-requisitos

- Node.js 20 ou superior
- Docker (para subir o PostgreSQL) **ou** um PostgreSQL local

## Como rodar

```bash
cd backend

# 1. Dependências
npm install

# 2. Variáveis de ambiente (no Windows/PowerShell use: copy .env.example .env)
cp .env.example .env
# O RF03 (recuperação de senha) exige as chaves do Brevo e um
# RECUPERACAO_CODIGO_SECRET. Em produção (NODE_ENV=production) a API não sobe
# sem eles; em desenvolvimento a API sobe normalmente. Veja docs/recuperacao-de-senha.md

# 3. Banco de dados
npm run db:up                 # sobe o PostgreSQL via docker compose
npm run prisma:migrate        # cria as tabelas a partir do schema
npm run prisma:seed           # (opcional) popula dados de demonstração

# 4. API
npm run start:dev
```

A API sobe em `http://localhost:3000/api` e a documentação interativa em
**`http://localhost:3000/api/docs`**.

O seed cria dois usuários (senha `senha12345`) e a viagem de demonstração de código `DEMO2027`.

## Scripts

| Comando | O que faz |
| ------- | --------- |
| `npm run start:dev` | Sobe a API em modo watch |
| `npm run build` | Compila para `dist/` |
| `npm run lint` | ESLint + Prettier com correção automática |
| `npm test` | Testes unitários |
| `npm run test:e2e` | Teste de integração do app (não exige banco) |
| `npm run db:up` / `npm run db:down` | Sobe/derruba o PostgreSQL do docker compose |
| `npm run prisma:migrate` | Cria e aplica uma migration |
| `npm run prisma:studio` | Abre o Prisma Studio para inspecionar os dados |
| `npm run prisma:seed` | Popula o banco com dados de demonstração |

## Problemas comuns

**`EPERM: operation not permitted ... query_engine-windows.dll.node`** ao rodar
`prisma generate` ou `prisma migrate` no Windows — a API está rodando e mantém o
arquivo do engine aberto. Pare o `npm run start:dev` antes, ou rode
`npx prisma migrate dev --skip-generate`.

**`Environment variable not found: DATABASE_URL`** — falta o `.env`; copie de
`.env.example`. O `prisma.config.ts` carrega o `.env` via `import 'dotenv/config'`:
com um arquivo de config, a CLI do Prisma deixa de carregar o `.env` sozinha.

**Porta 5432 já em uso** — outro PostgreSQL local está ativo. Defina
`POSTGRES_PORT` no `.env` (ex.: `5433`) e reflita a mesma porta na
`DATABASE_URL`; o `docker-compose.yml` publica a porta que estiver ali.

## Organização do código

Preenche a Seção 4.2 (*Organização do Código*) do Documento de Arquitetura.

```
backend/
├── prisma/
│   ├── schema.prisma          # DER da Seção 5.1, em código
│   └── seed.ts                # dados de demonstração
├── prisma.config.ts           # configuração da CLI do Prisma
└── src/
    ├── main.ts                # bootstrap: CORS, Helmet, ValidationPipe, Swagger
    ├── app.module.ts          # composição dos módulos + guards globais
    ├── config/                # leitura e validação do .env
    ├── prisma/                # PrismaService (cliente do banco)
    ├── common/                # decorators, guards, filtros e DTOs compartilhados
    └── modules/               # um módulo por módulo do Documento de Requisitos
        ├── auth/              # Módulo 1 — Autenticação
        ├── usuarios/          # Módulo 1 — Perfil
        ├── viagens/           # Módulo 2 — Gestão de Viagens
        ├── destinos/          # Módulo 3 — Destinos
        ├── atividades/        # Módulo 4 — Atividades
        ├── orcamento/         # Módulo 5 — Orçamento
        ├── membros/           # Módulo 6 — Colaboração
        └── avaliacoes/        # Módulo 7 — Avaliação e Descoberta
```

Cada módulo segue o padrão do NestJS: `*.controller.ts` (rotas e validação de
entrada), `*.service.ts` (regra de negócio) e `dto/` (contratos de entrada e saída).

## Recuperação de senha (RF03)

Código de 6 dígitos enviado por e-mail via Brevo, em três etapas. Em produção, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` e
`RECUPERACAO_CODIGO_SECRET` são obrigatórias; em desenvolvimento, o envio pode
ficar desconfigurado. A configuração, os limites e os erros comuns estão em **[docs/recuperacao-de-senha.md](docs/recuperacao-de-senha.md)**.

## Controle de acesso

O `JwtAuthGuard` é **global**: toda rota exige token, salvo as anotadas com
`@Publico()` — o caso dos catálogos de destinos e atividades, acessíveis a
visitantes (RN01).

O acesso por viagem (RN02, RN03, RN04, RN06) é feito pelo `AcessoViagemGuard`
combinado ao decorator `@NivelAcesso()`, em rotas com o parâmetro `:viagemId`:

```ts
@Patch(':viagemId')
@NivelAcesso(NivelAcessoViagem.EDITOR)   // criador ou colaborador EDITOR
atualizar(@Param('viagemId') viagemId: string, @Body() dto: AtualizarViagemDto) { ... }
```

| Nível | Quem passa | Regra |
| ----- | ---------- | ----- |
| `MEMBRO` | criador ou qualquer colaborador | RN06 |
| `EDITOR` | criador ou colaborador com permissão `EDITOR` | RN02, RN03 |
| `CRIADOR` | somente o criador da viagem | RN04 |

Quando o usuário não participa da viagem, a resposta é **404** e não 403: não
revelamos a existência de viagens de terceiros (RN06).

## Rotas

Todas sob o prefixo `/api`.

| Método | Rota | Requisito | Acesso |
| ------ | ---- | --------- | ------ |
| `POST` | `/auth/registrar` | RF01 | Público |
| `POST` | `/auth/login` | RF02 | Público |
| `POST` | `/auth/logout` | RF02 | Autenticado |
| `POST` | `/auth/recuperar-senha` | RF03 | Público |
| `POST` | `/auth/verificar-codigo` | RF03 | Público |
| `POST` | `/auth/redefinir-senha` | RF03 | Público |
| `GET` | `/usuarios/eu` | — | Autenticado |
| `PATCH` | `/usuarios/eu` | — | Autenticado |
| `POST` | `/viagens` | RF04 | Autenticado |
| `GET` | `/viagens` | RF06 | Autenticado |
| `GET` | `/viagens/:viagemId` | RN06 | Membro |
| `PATCH` | `/viagens/:viagemId` | RF05, RF07 | Editor |
| `DELETE` | `/viagens/:viagemId` | RF05 | Criador |
| `GET` | `/destinos` | RF10 | Público |
| `GET` | `/destinos/:id` | RF09 | Público |
| `POST` | `/destinos` | RF09 | Autenticado |
| `GET` | `/viagens/:viagemId/destinos` | RF08 | Membro |
| `POST` | `/viagens/:viagemId/destinos` | RF08 | Editor |
| `PATCH` | `/viagens/:viagemId/destinos/:destinoId` | RF08 | Editor |
| `DELETE` | `/viagens/:viagemId/destinos/:destinoId` | RF08 | Editor |
| `GET` | `/atividades` | RF24 | Público |
| `GET` | `/atividades/destaques` | RF25 | Público |
| `GET` | `/atividades/:id` | RF23 | Público |
| `POST` | `/atividades` | RF12 | Autenticado |
| `GET` | `/viagens/:viagemId/atividades` | RF14 | Membro |
| `POST` | `/viagens/:viagemId/atividades` | RF12, RF13 | Editor |
| `PATCH` | `/viagens/:viagemId/atividades/:atividadeId` | RF13 | Editor |
| `DELETE` | `/viagens/:viagemId/atividades/:atividadeId` | RF13 | Editor |
| `GET` | `/viagens/:viagemId/orcamento` | RF15 | Membro |
| `GET` | `/viagens/:viagemId/orcamento/resumo` | RF17 | Membro |
| `PUT` | `/viagens/:viagemId/orcamento` | RF15 | Editor |
| `POST` | `/viagens/:viagemId/membros/entrar` | RF18 | Autenticado |
| `GET` | `/viagens/:viagemId/membros` | RF19 | Membro |
| `PATCH` | `/viagens/:viagemId/membros/:membroId` | RF20 | Criador |
| `DELETE` | `/viagens/:viagemId/membros/:membroId` | RF20 | Criador |
| `DELETE` | `/viagens/:viagemId/membros/sair` | — | Membro |
| `GET` | `/atividades/:atividadeId/avaliacoes` | RF23 | Público |
| `POST` | `/atividades/:atividadeId/avaliacoes` | RF22 | Autenticado |
| `DELETE` | `/avaliacoes/:avaliacaoId` | RF22 | Autor |
| `GET` | `/health` | — | Público |

## Decisões tomadas neste esqueleto

Registradas aqui porque vão além do que a documentação especifica:

1. **`viagem.id` é o próprio código de convite** — 8 caracteres, alfabeto sem
   `0`/`O` e `1`/`I` para poder ser ditado sem ambiguidade. Atende o RF18 sem criar
   uma coluna extra, como sugere o DER (`id/código_convite`).
2. **Quem entra pelo código começa como `VISUALIZADOR`** (RN03). O criador promove
   a `EDITOR` quando quiser (RF20) — o caminho seguro por padrão.
3. **Uma avaliação por usuário por atividade** (índice único em
   `avaliacao(usuario_id, catalogo_atividade_id)`). Reavaliar sobrescreve a nota
   anterior. O documento não define o comportamento; esta escolha evita spam de reviews.
4. **`catalogo_atividade.media_avaliacao` e `orcamento.previsto_atividades` são
   recalculados a cada escrita**, mantendo consistentes os campos que o DER define
   como derivados (usados nos filtros do RF24 e no painel do RF17).
5. **`bcryptjs` no lugar de `bcrypt`** — mesma API, sem compilação nativa, o que
   evita depender do Visual Studio Build Tools em máquinas Windows.

## Pendências mapeadas

Marcadas como `TODO` no código, aguardando decisão da equipe:

- **RF11** — endpoint dos países já visitados, para o mapa (jsVectormap).
- **RF21** — notificações in-app para colaboradores.
- **Google Places API** — integração do Serviço de Locais/Atividades (Seção 2 da arquitetura).

## Contribuindo

Siga a política de branches e de commits do [CONTRIBUTING.md](../CONTRIBUTING.md):
branches de feature partem da `devel` e são nomeadas `<número-da-issue>-descricao_da_feature`.
