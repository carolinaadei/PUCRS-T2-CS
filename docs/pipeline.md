# Pipeline de CI/CD

Este documento descreve os portões automáticos que todo código atravessa antes de
entrar na `main`, e o que precisa ser configurado **manualmente** no GitHub, no
SonarQube e no Docker Hub para que eles funcionem.

O workflow está em [`.github/workflows/ci.yml`](https://github.com/carolinaadei/PUCRS-T2-CS/blob/main/.github/workflows/ci.yml).

## Quando o pipeline roda

| Evento | Jobs executados |
|--------|-----------------|
| Pull request para `main` ou `dev` | `lint`, `testes`, `contrato`, `sonarqube`, `imagem` |
| Push na `main` | todos, incluindo `publicar` |
| Tag `v*` (ex.: `v1.2.3`) | todos, incluindo `publicar` |

Cada portão é um job separado. No PR isso mostra **qual** etapa reprovou sem
precisar abrir o log, e permite exigir os checks individualmente na proteção da
branch. Os cinco primeiros rodam em paralelo (`sonarqube` espera a cobertura de
`testes`); `publicar` só começa quando todos passam.

## Os portões

### 1. `lint` — ESLint em modo verificação

`npm run lint:ci` roda `eslint --max-warnings=0` sobre `src`, `test` e `scripts`.
O `--fix` do script de desenvolvimento **não** é usado no CI: o objetivo é
reprovar, não reescrever. O repositório está em zero warnings hoje, então tratar
warning como falha impede que a dívida volte a crescer em silêncio.

Formatação também falha aqui: o Prettier entra no ESLint pelo
`eslint-plugin-prettier`, configurado em `backend/eslint.config.mjs`.

### 2. `testes` — Jest com relatório de cobertura

Duas suítes, duas configurações:

* `npm run test:cov` — testes unitários (`src/**/*.spec.ts`) → `backend/coverage/lcov.info`
* `npm run test:cov:e2e` — testes e2e (`test/**/*.e2e-spec.ts`) → `backend/coverage-e2e/lcov.info`

Os dois `lcov` viram um artifact chamado `cobertura`, consumido pelo job do Sonar.
A cobertura unitária sozinha ignoraria tudo que só é exercitado via HTTP —
controllers, guards, pipes e filtros — por isso os dois relatórios são somados.

Os e2e usam um `PrismaService` mockado, então **não precisam de banco no CI**. A
suíte `integracao.e2e-spec.ts` se auto-pula quando não há um `DATABASE_URL` real.

Qualquer teste que quebre derruba o job, e com ele o PR.

### 3. `contrato` — Spectral sobre o OpenAPI

O contrato não é versionado: ele é derivado dos decorators dos controllers pelo
`@nestjs/swagger`. O job gera o arquivo do commit em análise com
`npm run openapi:gerar` (script em `backend/scripts/gerar-openapi.ts`) e só então
roda o `stoplightio/spectral-action` sobre ele.

Gerar em vez de commitar evita uma segunda fonte de verdade que envelhece sem
ninguém notar. Para inspecionar o contrato localmente:

```bash
cd backend
npm run openapi:gerar   # escreve backend/openapi.json (ignorado pelo git)
```

As regras estão em [`.spectral.yaml`](https://github.com/carolinaadei/PUCRS-T2-CS/blob/main/.spectral.yaml),
que estende `spectral:oas` — o ruleset oficial da OpenAPI. Sobre a base, algumas
regras foram elevadas a `error` (contato, licença, servers, tags e `operationId`
em toda rota) e uma foi desligada: `operation-operationId-valid-in-url`, que exige
camelCase e reprovaria **todas** as rotas por causa do formato
`Controller_metodo` que o Nest gera.

O Spectral falha o job em qualquer violação de severidade `error`; `warn` aparece
no log sem barrar o merge. O contrato está hoje em zero erros e zero warnings.

### 4. `sonarqube` — análise estática com Quality Gate

`SonarSource/sonarqube-scan-action` roda com `projectBaseDir: backend` e recebe a
cobertura baixada do artifact do job anterior.

O argumento decisivo é `-Dsonar.qualitygate.wait=true`: sem ele o scanner envia a
análise e termina com sucesso, e o PR passaria **mesmo com o gate vermelho**. Com
ele, o scanner bloqueia até o servidor calcular o gate e sai com código diferente
de zero se reprovar.

A configuração da análise está em `backend/sonar-project.properties`, incluindo o
porquê de ela viver em `backend/` e não na raiz (resumo: os caminhos dentro dos
`lcov` do Jest são relativos ao `backend/`).

### 5. `imagem` — build e scan de vulnerabilidades

Build com `docker/build-push-action` a partir de `backend/Dockerfile`, seguido de
`aquasecurity/trivy-action` com `severity: HIGH,CRITICAL` e `exit-code: 1` — ou
seja, qualquer vulnerabilidade alta ou crítica derruba o PR.

O scan roda com `ignore-unfixed: true`. Vulnerabilidade sem correção publicada não
tem o que ser feito no nosso Dockerfile, e barrar o merge nesses casos só
ensinaria o time a ignorar o scan. Exceções conscientes — quando a correção existe
mas não pode ser aplicada agora — vão no [`.trivyignore`](https://github.com/carolinaadei/PUCRS-T2-CS/blob/main/.trivyignore)
com justificativa e data de revisão.

O relatório em tabela sobe como artifact (`relatorio-trivy`) mesmo quando o job
falha, que é justamente quando alguém precisa lê-lo.

Sobre o `Dockerfile`: é multi-stage. O estágio de build carrega Nest CLI, ts-jest e
o resto das devDependencies; nada disso vai para a imagem final, e cada pacote a
menos é uma vulnerabilidade a menos para o Trivy encontrar. O runtime roda como
usuário `node`, sem privilégios, e traz um `HEALTHCHECK` que bate em `/api/health`.

#### O que foi corrigido para o scan passar

O primeiro scan desta imagem acusou **43 vulnerabilidades HIGH/CRITICAL**. O SO
Alpine estava limpo (zero achados); todas vinham de pacotes Node, em dois grupos:

**41 delas estavam no `npm` embutido na imagem base** — `tar`, `pacote`,
`sigstore`, `glob`, `minimatch` e companhia, em
`/usr/local/lib/node_modules/npm/node_modules/`. O runtime só executa
`node dist/main` e não instala nada, então o `Dockerfile` **apaga npm, npx,
corepack e yarn** do estágio final. Remover código que nunca é executado é mais
honesto do que suprimir o alerta no `.trivyignore`.

**As outras 2 eram dependências transitivas reais**, corrigidas via
`overrides` no `backend/package.json`:

| Pacote | Vinha de | Era | Foi para |
|--------|----------|-----|----------|
| `multer` | `@nestjs/platform-express` | 2.2.0 (3 CVEs de DoS) | ^2.3.0 |
| `deepmerge-ts` | `@prisma/client` → `prisma` → `@prisma/config` | 7.1.5 (stack exhaustion) | ^8.0.0 |

Nos dois casos o pacote pai já está na última versão publicada e ainda aponta para
a versão vulnerável, então o `override` é a única saída sem trocar de framework.
Quando o pai subir sozinho, remova a entrada.

Resultado: **zero HIGH/CRITICAL**.

### 6. `publicar` — Docker Hub

Só roda em push na `main` ou em tag `v*`, e só depois de **todos** os portões
anteriores: nenhuma imagem chega ao registro sem lint, testes, contrato, Quality
Gate e scan aprovados.

A imagem publicada é exatamente a que o Trivy aprovou: o job `imagem` exporta o
`docker save` como artifact e o `publicar` faz `docker load` e apenas re-tagueia.
Reconstruir aqui publicaria camadas que ninguém escaneou.

Tags aplicadas (`docker/metadata-action`), todas apontando para o mesmo digest:

| Tag | Quando |
|-----|--------|
| `latest` | push na `main` e tags `v*` |
| `1.2.3`, `1.2`, `1` | apenas em tag `v1.2.3` (versão semântica) |
| `sha-<sha completo>` | sempre — é o que amarra a imagem ao commit |

---

## Configuração manual

O código do pipeline está no repositório, mas estes quatro itens só existem nas
interfaces do GitHub, do Sonar e do Docker Hub. Sem eles o CI reprova.

### A. Secrets e variables do repositório

`Settings → Secrets and variables → Actions`:

| Nome | Tipo | Valor |
|------|------|-------|
| `SONAR_TOKEN` | secret | token gerado no Sonar (ver item B) |
| `SONAR_HOST_URL` | secret | URL do servidor SonarQube, ou `https://sonarcloud.io` |
| `DOCKERHUB_USERNAME` | secret | usuário do Docker Hub |
| `DOCKERHUB_TOKEN` | secret | **Access Token** do Docker Hub, nunca a senha (ver item C) |
| `DOCKERHUB_IMAGEM` | variable (opcional) | nome completo da imagem, ex.: `minhaorg/viajajunto-backend`. Só é necessário se o namespace no Docker Hub for diferente do usuário que autentica; sem ela o workflow usa `<DOCKERHUB_USERNAME>/viajajunto-backend` |

O job do Sonar confere os dois primeiros e falha com uma mensagem explícita se
estiverem vazios, em vez de deixar o erro cru do scanner no log.

### B. Projeto no SonarQube / SonarCloud

O projeto já está criado no SonarQube Cloud, importado do GitHub. As chaves estão
em `backend/sonar-project.properties` e precisam continuar batendo com o servidor:

```properties
sonar.projectKey=carolinaadei_PUCRS-T2-CS
sonar.organization=carolinaadei
```

Passos restantes:

1. Gere um token em `My Account → Security` e guarde como `SONAR_TOKEN`.
2. **Desligue a Automatic Analysis** (`Administration → Analysis Method`). Com ela
   ligada, a análise do CI é rejeitada — e ela também ignora este arquivo de
   configuração: a primeira análise automática varreu o repositório inteiro e
   contabilizou 37 mil linhas e ~1000 "bugs", quase tudo vindo do Bootstrap e do
   FontAwesome versionados em `docs/stylesheets/assets/`. A análise do CI roda com
   `projectBaseDir=backend` e `sonar.sources=src`, ou seja, apenas as ~4.800
   linhas de código nosso.
3. Confira o Quality Gate em `Project Settings → Quality Gate`. O *Sonar way*
   padrão cobra 80% de cobertura **em código novo** — só o que o PR alterou, não o
   projeto inteiro.

### C. Access Token no Docker Hub

1. `hub.docker.com → Account Settings → Personal access tokens → Generate new token`.
2. Permissão **Read & Write** (o pipeline só faz push).
3. Guarde como `DOCKERHUB_TOKEN`. Não use a senha da conta: o token é revogável e
   tem escopo limitado.
4. Crie o repositório `viajajunto-backend` no Docker Hub (ou deixe o primeiro push
   criá-lo, se a conta permitir).

### D. Proteção da branch `main`

`Settings → Branches → Add branch ruleset` (ou *Branch protection rules*), alvo
`main`:

- [x] **Require a pull request before merging** — bloqueia push direto na `main`
  - [x] Require approvals: **1**
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Checks obrigatórios (nomes exatos, como aparecem no PR):
    - `Lint (ESLint)`
    - `Testes + cobertura`
    - `Contrato OpenAPI (Spectral)`
    - `SonarQube (Quality Gate)`
    - `Imagem Docker + Trivy`
- [x] **Require conversation resolution before merging**
- [x] **Block force pushes**
- [x] **Restrict deletions**
- [ ] *Allow bypass* — deixe **vazio**, inclusive para administradores; uma exceção
      de admin torna todo o resto opcional na prática

> Os checks só aparecem na lista de seleção depois de terem rodado pelo menos uma
> vez. Abra um PR primeiro, deixe o CI rodar, e então configure a proteção.

---

## Evidência da entrega

Para fechar o item "link de uma PR fechada com os checks passando":

1. Abra um PR de `dev` → `main` com estas mudanças.
2. Espere os cinco checks ficarem verdes.
3. Faça o merge e cole aqui o link do PR fechado:

**PR de evidência:** _(preencher com a URL do PR após o merge)_

## Rodando os portões localmente

Antes de abrir o PR, os mesmos comandos do CI:

```bash
cd backend
npm ci
npx prisma generate

npm run lint:ci          # portão 1
npm run test:cov         # portão 2 (unitários)
npm run test:cov:e2e     # portão 2 (e2e)
npm run openapi:gerar    # portão 3 - gera backend/openapi.json
npx @stoplight/spectral-cli lint openapi.json --ruleset ../.spectral.yaml

docker build -t viajajunto-backend:local .                      # portão 5
docker run --rm aquasec/trivy image --severity HIGH,CRITICAL \
  --ignore-unfixed --exit-code 1 viajajunto-backend:local
```
