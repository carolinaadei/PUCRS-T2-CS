## **Documento de Arquitetura de Software**

## **1. Introdução**

### **1.1 Finalidade**
Este documento apresenta uma visão geral da arquitetura de software do sistema ViajaJunto e especifica as decisões arquiteturais pertinentes ao seu desenvolvimento, servindo de referência para os desenvolvedores do projeto.

### **1.2 Escopo**
Este documento abrange a arquitetura do ViajaJunto — aplicação web de planejamento colaborativo de viagens. Deve ser seguido pela equipe de desenvolvimento para garantir o padrão arquitetural proposto, incluindo separação entre frontend e backend, organização do banco de dados e controle de acesso.

### **1.3 Definições, Acrônimos e Abreviações**

|Abreviação|Definição|
| - | - |
|API|Application Programming Interface|
|REST|Representational State Transfer|
|JWT|JSON Web Token|
|DER|Diagrama de Entidades e Relacionamentos|
|DLD|Diagrama Lógico de Dados|
|MVC|Model-View-Controller|

### **1.4 Visão Geral**
Este documento descreve a representação da arquitetura cliente-servidor adotada, as metas e restrições arquiteturais, a visão lógica com organização em camadas e o modelo de dados relacional do sistema.

## **2. Representação da Arquitetura**

O repositório entrega uma **API REST para frontends de terceiros**. Não inclui
uma aplicação NextJS nem um serviço de renderização de mapas.

- **Clientes externos:** implementam telas, mapas e consumo do contrato público HTTP/JSON.
- **Backend (NestJS):** autenticação, autorização por viagem, regras de negócio e catálogo interno de destinos e atividades.
- **PostgreSQL + Prisma:** persistência relacional e migrations versionadas.
- **Serviços AWS:** S3 para fotos; SQS e SES para e-mails; Secrets Manager e SSM para configuração. Em desenvolvimento e no CI, são emulados pelo MiniStack.
- **Worker:** processo separado que consome a fila de e-mails e entrega pelo provedor configurado.

A **Geoapify** fornece busca de cidades, autocompletar e pontos de interesse.
A importação confirma os dados no fornecedor e grava no catálogo local a
identidade `fonte` + `idExterno`, o país ISO e as atribuições. Reimportações
reutilizam o item sem alterar autoria, fotos ou avaliações. Detalhes em
[Geoapify: configuração e uso](geoapify.md).

### **2.1 Diagrama de Relações**

```text
Clientes de terceiros -- HTTP/JSON --> API NestJS --> PostgreSQL
                                         |
                                         +--> S3 (upload direto pelo cliente com formulario assinado)
                                         +--> SQS --> Worker --> SES / provedor de e-mail
                                         +--> Secrets Manager + SSM (configuracao no boot)

Desenvolvimento/CI: servicos AWS emulados pelo MiniStack.
API --> Geoapify (busca e detalhes para importacao; chave no servidor).
```

## **3. Metas e Restrições de Arquitetura**

|**Restrição**|**Ferramenta**|
| :- | :- |
|Linguagem|TypeScript no Node.js 22|
|Framework|NestJS 11; Prisma 6 para acesso ao PostgreSQL 16|
|Plataforma|API HTTP/JSON; clientes externos independentes|
|Segurança|Senhas com bcrypt; JWT e refresh tokens; controle de acesso por viagem|
|Idioma|Português (pt-BR)|
|Mapa interativo|Responsabilidade do cliente; a API fornece países visitados em ISO 3166-1 alfa-2|

## **4. Visão Lógica**

### **4.1 Visão geral: Pacotes e Camadas**

- **Controllers e DTOs:** rotas HTTP, validação de entrada e contrato OpenAPI.
- **Services:** regras de negócio, transações e orquestração de notificações e integrações implementadas.
- **Guards:** autenticação e autorização conforme vínculo e permissão na viagem.
- **Prisma:** acesso ao banco e persistência do catálogo interno, independente de APIs de lugares.
- **Infraestrutura e worker:** fotos no S3 e entrega assíncrona de e-mails pela fila.

### **4.2 Organização do Código**

O código executável está em `backend/`:

- `src/modules/`: módulos de negócio e integrações da API.
- `src/common/`: DTOs, erros, guards, decorators, utilitários e convenções HTTP compartilhadas.
- `src/config/`: validação do ambiente, configuração AWS, logging, aplicação e Swagger.
- `src/prisma/` e `prisma/`: serviço de banco, schema, migrations e seed.
- `src/main.ts` e `src/worker.ts`: pontos de entrada da API e do worker.
- `test/`: testes e2e e de integração; testes unitários ficam junto do código em `src/`.

### **4.3 Infraestrutura**

Os serviços gerenciados que a API consome — armazenamento de fotos (S3), fila de e-mails com DLQ (SQS), envio de e-mail (SES), segredos (Secrets Manager) e configuração (SSM Parameter Store) — são declarados em CloudFormation e, em desenvolvimento e no CI, aplicados no emulador MiniStack pelo próprio `docker compose up`. O mesmo modelo e a mesma imagem sobem na AWS sem alteração de código. Detalhes em [Infraestrutura (MiniStack)](infra-ministack.md).

### **4.4 Diagrama de Classes**

A dependência típica de uma operação é:

```text
Controller --> DTO de entrada (validacao)
    |
    +--> Service --> PrismaService --> PostgreSQL
              |
              +--> NotificacoesService / servicos de infraestrutura
    |
    +--> DTO de resposta (contrato publico)
```

Por exemplo, `AtividadesController` delega a `AtividadesService`, que usa
`PrismaService`, `OrcamentoService` e `NotificacoesService`. Guards verificam o
acesso antes da execução de operações vinculadas a uma viagem.

## **5. Visão de Implementação**

### **5.1 Diagrama de Entidade-Relacionamento**

O modelo relacional é composto pelas entidades abaixo. A fonte de verdade é o [schema Prisma](https://github.com/carolinaadei/PUCRS-T2-CS/blob/dev/backend/prisma/schema.prisma); o DLD textual está na seção 5.2.

#### Enums

| Enum | Valores |
| ---- | ------- |
| `status_viagem` | `EM_PLANEJAMENTO`, `CONFIRMADA`, `CONCLUIDA` |
| `permissao_membro` | `EDITOR`, `VISUALIZADOR` |
| `categoria_destino` | `CIDADE`, `PRAIA`, `NATUREZA`, `CULTURAL` |
| `tipo_atividade` | `PASSEIO`, `REFEICAO`, `HOSPEDAGEM`, `TRANSPORTE`, `OUTRO` |
| `status_atividade` | `PENDENTE`, `CONFIRMADA`, `CONCLUIDA` |
| `tipo_notificacao` | `VIAGEM_ATUALIZADA`, `DESTINO_ADICIONADO`, `DESTINO_ATUALIZADO`, `DESTINO_REMOVIDO`, `ATIVIDADE_ADICIONADA`, `ATIVIDADE_ATUALIZADA`, `ATIVIDADE_REMOVIDA`, `ORCAMENTO_ATUALIZADO`, `ORCAMENTO_REMOVIDO`, `MEMBRO_ENTROU`, `MEMBRO_SAIU`, `MEMBRO_REMOVIDO`, `PERMISSAO_ALTERADA` |

#### Tabelas

**usuario**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `nome` | varchar | NOT NULL |
| `email` | varchar | NOT NULL, UNIQUE |
| `senha_hash` | varchar | NOT NULL |
| `versao_sessao` | integer | default: 0 — incrementar invalida os tokens de acesso emitidos |
| `criado_em` | timestamp | default: `now()` |

**sessao_refresh**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `usuario_id` | integer | NOT NULL, FK → usuario.id |
| `token_hash` | varchar | NOT NULL, UNIQUE (SHA-256 do refresh token) |
| `expira_em` | timestamp | NOT NULL |
| `revogada_em` | timestamp | preenchido quando o token é trocado (rotação) |
| `criada_em` | timestamp | default: `now()` |

**token_recuperacao_senha**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `usuario_id` | integer | NOT NULL, FK → usuario.id |
| `codigo_hash` | varchar | NOT NULL (HMAC do código de 6 dígitos) |
| `tentativas` | integer | default: 0 |
| `expira_em` | timestamp | NOT NULL |
| `verificado_em` | timestamp | |
| `troca_hash` | varchar | UNIQUE |
| `troca_expira_em` | timestamp | |
| `usado_em` | timestamp | |
| `criado_em` | timestamp | default: `now()` |

**viagem**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | varchar(12) | PK; gerado pela API com 8 caracteres; seeds podem ter outro comprimento |
| `codigo_convite` | varchar(12) | NOT NULL, UNIQUE — pode ser trocado pelo criador |
| `nome` | varchar | NOT NULL |
| `descricao` | text | |
| `data_inicio` | date | |
| `data_fim` | date | |
| `status` | status_viagem | NOT NULL |
| `criado_por` | integer | NOT NULL, FK → usuario.id |
| `criado_em` | timestamp | default: `now()` |

**membro_viagem**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `viagem_id` | varchar(12) | NOT NULL, FK → viagem.id |
| `usuario_id` | integer | NOT NULL, FK → usuario.id |
| `permissao` | permissao_membro | NOT NULL |
| `entrou_em` | timestamp | default: `now()` |

**destino_catalogo**

Além dos dados de cidade, o catálogo persiste `fonte` (varchar(40), default
`manual`), `id_externo` (varchar(2048), opcional), `codigo_pais` (varchar(2),
opcional) e `atribuicoes` (jsonb, default `[]`). O par `fonte, id_externo` é único.

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `nome` | varchar | NOT NULL |
| `pais` | varchar | |
| `categoria` | categoria_destino | |
| `descricao` | text | |
| `latitude` | float | |
| `longitude` | float | |
| `foto_url` | varchar | |
| `criado_por` | integer | FK → usuario.id (SET NULL); só quem cadastrou edita |
| `criado_em` | timestamp | default: `now()` |

> Como cada destino representa uma cidade do mundo, o campo `nome` deve indicar a cidade em si, e o país é informado separadamente para contextualização geográfica.

**destino_viagem**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `viagem_id` | varchar(12) | NOT NULL, FK → viagem.id |
| `destino_catalogo_id` | integer | NOT NULL, FK → destino_catalogo.id |
| `chegada` | date | |
| `saida` | date | |
| `descricao` | text | |
| `ordem` | integer | sequência 0..n-1 por viagem |

**catalogo_atividade**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `nome` | varchar | NOT NULL |
| `descricao` | text | |
| `tipo_atividade` | tipo_atividade | NOT NULL |
| `local` | varchar | |
| `cidade` | varchar | |
| `pais` | varchar | |
| `latitude` | float | |
| `longitude` | float | |
| `id_externo` | varchar(2048) | opcional; UNIQUE em conjunto com `fonte` |
| `codigo_pais` | varchar(2) | ISO alfa-2; opcional |
| `atribuicoes` | jsonb | créditos e links; default: `[]` |
| `foto_url` | varchar | |
| `fonte` | varchar | default: `manual`; valores usados: `manual`, `seed`, `geoapify` |
| `media_avaliacao` | float | default: 0 (derivado) |
| `criado_por` | integer | FK → usuario.id (SET NULL); só quem cadastrou edita |
| `criado_em` | timestamp | default: `now()` |

**atividade_viagem**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `destino_viagem_id` | integer | NOT NULL, FK → destino_viagem.id |
| `catalogo_atividade_id` | integer | NOT NULL, FK → catalogo_atividade.id |
| `data_horario` | timestamp | |
| `duracao_min` | integer | |
| `custo_previsto` | decimal(10,2) | |
| `status` | status_atividade | NOT NULL |

**orcamento**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `viagem_id` | varchar(12) | NOT NULL, UNIQUE, FK → viagem.id (1:1) |
| `valor_total` | decimal(10,2) | NOT NULL |
| `previsto_atividades` | decimal(10,2) | default: 0 |

**avaliacao**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `usuario_id` | integer | NOT NULL, FK → usuario.id |
| `catalogo_atividade_id` | integer | NOT NULL, FK → catalogo_atividade.id |
| `nota` | integer | NOT NULL (1 a 5) |
| `comentario` | text | |
| `criado_em` | timestamp | default: `now()` |
| `atualizado_em` | timestamp | default: `now()` |

**notificacao**

| Coluna | Tipo | Restrições |
| ------ | ---- | ---------- |
| `id` | integer | PK, auto-increment |
| `usuario_id` | integer | NOT NULL, FK → usuario.id (destinatário) |
| `viagem_id` | varchar(12) | NOT NULL, FK → viagem.id |
| `tipo` | tipo_notificacao | NOT NULL |
| `mensagem` | text | NOT NULL |
| `lida_em` | timestamp | null enquanto não lida |
| `criada_em` | timestamp | default: `now()` |

#### Relacionamentos

| De | Para | Cardinalidade |
| -- | ---- | ------------- |
| `viagem.criado_por` | `usuario.id` | N:1 |
| `membro_viagem.viagem_id` | `viagem.id` | N:1 |
| `membro_viagem.usuario_id` | `usuario.id` | N:1 |
| `destino_viagem.viagem_id` | `viagem.id` | N:1 |
| `destino_viagem.destino_catalogo_id` | `destino_catalogo.id` | N:1 |
| `atividade_viagem.destino_viagem_id` | `destino_viagem.id` | N:1 |
| `atividade_viagem.catalogo_atividade_id` | `catalogo_atividade.id` | N:1 |
| `orcamento.viagem_id` | `viagem.id` | 1:1 |
| `avaliacao.usuario_id` | `usuario.id` | N:1 |
| `avaliacao.catalogo_atividade_id` | `catalogo_atividade.id` | N:1 |
| `sessao_refresh.usuario_id` | `usuario.id` | N:1 |
| `token_recuperacao_senha.usuario_id` | `usuario.id` | N:1 |
| `notificacao.usuario_id` | `usuario.id` | N:1 |
| `notificacao.viagem_id` | `viagem.id` | N:1 |
| `destino_catalogo.criado_por` | `usuario.id` | N:1 |
| `catalogo_atividade.criado_por` | `usuario.id` | N:1 |

### **5.2 Diagrama Lógico de Dados**

O DLD textual abaixo representa as tabelas com chaves primárias e estrangeiras destacadas:

```
usuario(#id, nome, email, senha_hash, versao_sessao, criado_em)

sessao_refresh(#id, *usuario_id→usuario, token_hash, expira_em, revogada_em, criada_em)

token_recuperacao_senha(#id, *usuario_id→usuario, codigo_hash, tentativas, expira_em, verificado_em, troca_hash, troca_expira_em, usado_em, criado_em)

viagem(#id, codigo_convite, nome, descricao, data_inicio, data_fim, status, *criado_por→usuario, criado_em)

membro_viagem(#id, *viagem_id→viagem, *usuario_id→usuario, permissao, entrou_em)

destino_catalogo(#id, nome, pais, categoria, descricao, latitude, longitude, foto_url, fonte, id_externo, codigo_pais, atribuicoes, *criado_por→usuario, criado_em)

destino_viagem(#id, *viagem_id→viagem, *destino_catalogo_id→destino_catalogo, chegada, saida, descricao, ordem)

catalogo_atividade(#id, nome, descricao, tipo_atividade, local, cidade, pais, latitude, longitude, id_externo, codigo_pais, atribuicoes, foto_url, fonte, media_avaliacao, *criado_por→usuario, criado_em)

atividade_viagem(#id, *destino_viagem_id→destino_viagem, *catalogo_atividade_id→catalogo_atividade, data_horario, duracao_min, custo_previsto, status)

orcamento(#id, *viagem_id→viagem, valor_total, previsto_atividades)

avaliacao(#id, *usuario_id→usuario, *catalogo_atividade_id→catalogo_atividade, nota, comentario, criado_em, atualizado_em)

notificacao(#id, *usuario_id→usuario, *viagem_id→viagem, tipo, mensagem, lida_em, criada_em)
```
> Legenda: `#` chave primária · `*` chave estrangeira

## **6. Tamanho e Desempenho**

O sistema é direcionado ao público geral e deve suportar múltiplos usuários simultâneos acessando viagens compartilhadas. O carregamento das páginas principais deve ocorrer em menos de 3 segundos em condições normais de rede. O volume de dados por viagem é relativamente pequeno (destinos, atividades e orçamentos), mas o catálogo de destinos e avaliações pode crescer significativamente com o uso da comunidade.

## **7. Qualidade**

A arquitetura cliente-servidor com separação entre frontend e backend favorece:

- **Manutenibilidade:** as camadas evoluem de forma independente — mudanças no frontend não afetam a API e vice-versa.
- **Testabilidade:** a API REST pode ser testada de forma isolada com ferramentas como Postman ou testes automatizados.
- **Segurança:** o controle de acesso é centralizado no backend, garantindo que usuários só acessem dados das viagens às quais pertencem.
- **Escalabilidade:** a separação de responsabilidades permite escalar frontend e backend de forma independente conforme a demanda.

## **8. Referências**

- Documento de Escopo do Projeto — ViajaJunto (Grupo 4, T1)
- Documento de Requisitos — ViajaJunto
