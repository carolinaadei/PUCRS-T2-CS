# ViajaJunto

Planejamento colaborativo de viagens: um grupo organiza, num só lugar, roteiro
com vários destinos, atividades, orçamento e avaliações da comunidade.

### Entenda nossa proposta

Planejar uma viagem em grupo costuma ficar espalhado entre conversas, planilhas e
anotações individuais, sem um lugar onde todos vejam o roteiro completo, as
atividades e quanto já foi comprometido do orçamento. O ViajaJunto resolve isso
com viagens compartilhadas por código de convite, permissões por pessoa (editor
ou visualizador), orçamento com resumo por categoria, notificações das alterações
feitas pelos outros e um catálogo de destinos e atividades avaliado pela comunidade.

Este repositório contém a **API REST** (backend) e a documentação do projeto. A API
foi feita para ser consumida por qualquer front: contrato OpenAPI completo,
versionado em `/api/v1`, com formato de erro único e códigos estáveis.

### Conheça nossa equipe

| Membro | E-mail | Github | Matrícula |
|--------|--------|--------|-----------|
| Carolina De Souza Gonçalves | carolina.g@edu.pucrs.br | [carolinaadei](https://github.com/carolinaadei) | 24201034-6 |
| Jully Anne Seyffert da Silva Jara | jully.j@edu.pucrs.br | [jullySeyffert](https://github.com/jullySeyffert) | 23280111-8 |
| Rafael Meira Kreutz | rafael.kreutz003@edu.pucrs.br | [RafaelKreutz](https://github.com/RafaelKreutz) | 24102576-6 |

### Tecnologias

| Camada | Tecnologia |
|--------|------------|
| API | NestJS 11, TypeScript |
| Banco | PostgreSQL 16, Prisma 6 |
| Autenticação | JWT de acesso + refresh token rotativo |
| Serviços AWS | S3, SQS, SES, Secrets Manager, SSM Parameter Store |
| Infraestrutura como código | CloudFormation, aplicado no [MiniStack](https://ministack.org) |
| Contêineres | Docker e Docker Compose |
| Qualidade | Jest, ESLint, Spectral, SonarQube, Trivy (GitHub Actions) |

### Como rodar

Pré-requisito: Docker com Compose v2. Na raiz do repositório:

```bash
docker compose up -d --build --wait
```

Um único comando sobe o banco, o MiniStack, cria a infraestrutura pela pilha
CloudFormation, aplica as migrations com dados de demonstração e inicia a API e o
worker de e-mails.

| O quê | Onde |
|-------|------|
| API | <http://localhost:3000/api/v1> |
| Swagger (documentação interativa) | <http://localhost:3000/api/docs> |
| Contrato OpenAPI (JSON) | <http://localhost:3000/api/docs-json> |
| Saúde | <http://localhost:3000/api/health/ready> |
| E-mails enviados (SES do MiniStack) | <http://localhost:4566/_ministack/ses/messages> |

Contas de demonstração (senha `senha12345`): `ana.souza@example.com` e
`bruno.lima@example.com`. Viagens: `DEMO2027` (convite `EURO2027`) e `DEMO2026` (concluída).

Para desligar: `docker compose down` (com `-v`, apaga também os dados).

### Como testar

* **Passo a passo manual:** [docs/happy-path.md](docs/happy-path.md) percorre o produto
  inteiro com `curl` — cadastro, convite, roteiro com foto, orçamento, notificações,
  avaliação e recuperação de senha.
* **Automatizado:** `cd backend && npm test` (unitários) e `npm run test:e2e`
  (e2e; com Postgres e MiniStack disponíveis, inclui as suítes de integração).
  Detalhes no [README do backend](backend/README.md).

### Conheça nossa documentação

* [Documentação completa (GitHub Pages)](https://carolinaadei.github.io/PUCRS-T2-CS/)
* [Documento de Requisitos](docs/requirements.md) · [Documento de Arquitetura](docs/architecture.md)
* [Infraestrutura: CloudFormation no MiniStack](docs/infra-ministack.md)
* [Backend: rotas, convenções e decisões](backend/README.md) · [Recuperação de senha](backend/docs/recuperacao-de-senha.md)
* [Pipeline de CI/CD](docs/pipeline.md)

---

## Como Contribuir

### 1. Como começar
* Veja as issues abertas e o backlog do produto para entender o que o projeto precisa no momento.
* Se o seu problema ainda não estiver documentado, crie uma issue — mas priorize as existentes.

### 2. Orientações
* Colaboradores externos: façam um fork do projeto.
* Issues devem usar os [templates de issue](backend/.github/ISSUE_TEMPLATE) do repositório.
* Branches de feature partem da `dev`; o merge na `main` acontece por pull request da `dev`.
* As políticas de branches e de commits estão no guia de [contribuição](CONTRIBUTING.md).

### 3. Pipeline de CI/CD
A `main` é protegida: o merge só acontece por pull request, e o PR precisa passar por cinco portões automáticos — lint (ESLint), testes com cobertura (Jest, incluindo integração contra PostgreSQL e MiniStack), validação do contrato OpenAPI (Spectral), análise estática com Quality Gate (SonarQube) e scan de vulnerabilidades da imagem (Trivy, falhando em HIGH e CRITICAL). Aprovado e mesclado na `main`, ou marcado com uma tag `v*`, a imagem vai para o Docker Hub.

Os portões, como rodar cada um localmente antes de abrir o PR e a configuração manual necessária (secrets, projeto no Sonar, Access Token do Docker Hub e as regras de proteção da branch) estão em [docs/pipeline.md](docs/pipeline.md).
