# Sobre a demonstração — ambiente da API na AWS

O que o [`viajajunto-demo.yaml`](viajajunto-demo.yaml) é, por que ele existe,
como apresentá-lo e o que ele **não** prova.

Para a pilha local no emulador, que é outro modelo com outro papel, veja
[`comandos.md`](comandos.md).

---

## 1. O problema que isso resolve

O CI já constrói a imagem do backend, passa por todos os portões e a publica no
Docker Hub. Mas nenhum passo pegava essa imagem e a executava em algum lugar: o
artefato ficava no registro, e era isso.

```
push na main
     │
     ▼
┌──────────────────────────────────────────────┐
│ CI  (.github/workflows/ci.yml)               │
│ lint · testes · contrato · Sonar · Trivy     │
└──────────────────────┬───────────────────────┘
                       ▼
                   Docker Hub
            viajajunto-backend:latest
                       │
                       │  ◄───  o fluxo parava aqui
                       ▼
┌──────────────────────────────────────────────┐
│ infra/viajajunto-demo.yaml   (este modelo)   │
└──────────────────────┬───────────────────────┘
                       ▼
               pilha CloudFormation
                       │
                       ▼
     EC2 ──► Docker ──┬──► postgres:16-alpine      (rede interna)
                      └──► viajajunto-backend      :3000 ──► internet
```

A imagem é **entrada** do modelo, não algo que ele constrói. Quem decide qual
versão sobe é o parâmetro `TagImagem`.

Frase útil na apresentação: *"o CI já publica a imagem, mas nada a executava em
lugar nenhum; este modelo é o passo que faltava."*

## 2. O que o modelo declara

Cinco parâmetros, **dois** recursos, duas saídas.

| Recurso | Papel |
| --- | --- |
| `AWS::EC2::SecurityGroup` | Libera só a porta 3000. Sem `VpcId`, nasce na VPC padrão da conta. |
| `AWS::EC2::Instance` | Roda o `UserData`, que instala o Docker e sobe dois contêineres: o `postgres:16-alpine` (o mesmo do `backend/docker-compose.yml`) e a imagem do backend. |

A porta 5432 **nunca** é publicada no host: o banco é alcançado só pelo nome
`postgres` dentro da rede Docker, então o grupo de segurança não precisa de regra
para ele.

Três detalhes que valem apontar no código:

- **`AmiAmazonLinux` é um parâmetro do tipo SSM**
  (`AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`). O CloudFormation resolve o
  caminho público da AMI para o ID correto **na região da pilha** — é o que
  dispensa uma seção `Mappings` com um ID por região, que envelhece a cada
  atualização da imagem.
- **`JwtSecret` tem `NoEcho: true`**, então o console o mascara.
- **`CreationPolicy` com `ResourceSignal: Timeout: PT10M`.** Sem ele a pilha
  chegaria a `CREATE_COMPLETE` em ~30 s, enquanto a API precisa de 3 a 5 min — e
  a URL de saída daria *connection refused* na hora de abrir.

## 3. Por que o emulador não substitui isto

O MiniStack **recusa** este modelo: `AWS::EC2::Instance` não está entre os tipos
que o CloudFormation dele reconhece, e tipo não reconhecido derruba a criação na
hora (os comandos e as mensagens exatas estão em [`comandos.md`](comandos.md)).

Isso é o comportamento correto, não um defeito: um emulador cobre serviços
gerenciados, não a máquina virtual que você mesmo provisiona e cujo script de
inicialização precisa de um Docker de verdade e de saída para a internet. É aí
que está a fronteira entre os dois ambientes, e mostrar a recusa ensina onde ela
fica.

## 4. Antes da apresentação

Faça com antecedência — nada aqui rende demonstração ao vivo.

- [ ] **Conta AWS** com permissão para criar pilhas, instâncias EC2 e grupos de segurança.
- [ ] **Região com VPC padrão.** Confirme em **VPC → Your VPCs** que existe uma marcada como *Default VPC*. Sem ela, a criação falha.
- [ ] **Imagem publicada no Docker Hub.** Confirme o nome exato do repositório e que a tag `latest` existe.
- [ ] **Segredo do JWT** gerado: `openssl rand -base64 32`
- [ ] **Plano B:** crie uma pilha de reserva na véspera, com outro nome, e deixe a aba aberta.

## 5. Os passos no console

**1. Mostrar o modelo** (~1 min) — aponte, nesta ordem: `Parameters`,
`Resources` (são só dois), o `UserData` e as `Outputs`.

**2. Criar a pilha** — **CloudFormation → Create stack → With new resources**.
*Upload a template file* → `infra/viajajunto-demo.yaml`. Nome:
`viajajunto-demo`. Preencha `ImagemBackend`, `TagImagem` (`latest`),
`TipoInstancia` (`t3.micro`), `JwtSecret` (vem mascarado) e deixe o
`AmiAmazonLinux` no padrão. Não há nada para marcar em *Capabilities*: o modelo
não cria recursos de IAM.

**3. Acompanhar os eventos** (3 a 5 min) — fique na aba **Events**. O grupo de
segurança completa rápido; a instância fica **vários minutos** em
`CREATE_IN_PROGRESS`. É aqui que está o conteúdo: a instância já existe, mas o
CloudFormation está **esperando um sinal** dela. A maior parte do tempo é o
`docker pull`. Quando a pilha chega a `CREATE_COMPLETE`, a API **já está no ar** —
é exatamente o que o sinal significa.

**4. Mostrar que funciona** — veja a seção 6.

**5. Change set** — veja a seção 7.

**6. Excluir a pilha** — **Delete → Delete stack**, e narre a ordem inversa: a
instância sai primeiro, o grupo de segurança depois, porque não pode ser removido
enquanto a instância o usa. Para fechar: o banco vivia dentro do contêiner, sem
volume, então os dados vão junto — é o desejado num ambiente de demonstração, e é
o que o torna inadequado para qualquer outra coisa.

> **Confirme que a pilha foi excluída de verdade.** Uma `t3.micro` esquecida
> continua sendo cobrada.

## 6. O que mostrar, e o que cada coisa prova

### `UrlHealth` → `/api/health`

```json
{ "status": "ok", "banco": "ok", "timestamp": "..." }
```

O `"banco": "ok"` prova que a API alcança o Postgres pela rede interna do Docker.

> **O que este endpoint *não* prova:** que as migrations rodaram. O health executa
> um `SELECT 1`, que não toca em tabela nenhuma e funciona igual num banco vazio.
> Verificado: contra um Postgres sem nenhuma tabela, o `/api/health` responde
> `"banco": "ok"` do mesmo jeito.

### `/api/destinos` — a prova das migrations

Não está nas saídas; digite na barra de endereço.

```json
{ "itens": [], "total": 0, "pagina": 1, "limite": 20 }
```

**É o `200` com lista vazia que importa**, não o conteúdo. Essa rota faz um
`SELECT` numa tabela de verdade: sem as migrations a tabela não existiria e a
resposta seria `500`. Lista vazia significa "a tabela existe e está sem dados" —
o esperado, porque o modelo aplica as migrations mas **não roda o seed** (ele é
TypeScript e depende do `ts-node`, que não está na imagem de runtime).

### `UrlSwagger` → `/api/docs`

O Swagger UI carrega com o contrato completo. Role pelas seções para mostrar que
é a API inteira, não um *hello world*.

> **Cuidado:** o botão **Try it out** não funciona, e **não há como contornar na
> página**. O `servers` do documento OpenAPI tem uma única entrada,
> `http://localhost:3000` (`backend/src/config/swagger.ts`), então o botão aponta
> para a máquina de quem abriu o navegador. Com um servidor só, o Swagger UI
> mostra um seletor fixo, sem campo editável. Para mostrar a API respondendo ao
> vivo, use a barra de endereço: `/api/health` e `/api/destinos` são `GET`
> públicos.

## 7. O change set

**Stack actions → Create change set for current stack** → *Use current template*
→ troque `TipoInstancia` de `t3.micro` para `t3.small` → crie o change set.

Na aba **Changes**:

| Logical ID | Action | Replacement |
| --- | --- | --- |
| `InstanciaDemo` | `Modify` | `False` |

`Replacement: False` significa **parada e religada, não recriada**: a
documentação da AWS marca `InstanceType` como *"Update requires: Some
interruptions"*. A instância mantém o volume, o ID e os dados.

A frase a dizer é essa: *"o CloudFormation me diz o que vai acontecer antes de eu
deixar acontecer."* O valor do passo não é a palavra `True` — é a pilha responder
**qual** consequência o meu parâmetro provoca:

| Se eu mudar… | A AWS faz | `Replacement` |
| --- | --- | --- |
| `TipoInstancia` | Para e religa a instância | `False` |
| `AmiAmazonLinux` | Destrói e recria do zero | `True` |

A segunda linha vem da documentação da AWS, que marca `ImageId` como *"Update
requires: Replacement"*; ela não foi exercitada numa pilha real, ao contrário da
primeira.

> **Não anuncie `Replacement: True` para a troca de tipo.** É falso para uma
> instância EBS-backed, que é o caso do AL2023 deste modelo — a tela mostraria
> `False` e contradiria o apresentador. O mesmo vale para `TagImagem` e
> `ImagemBackend`: os dois mudam o `UserData`, que também é *"Some
> interruptions"*.

**Não execute.** Use **Delete change set**. A pilha fica intacta, ainda no ar.

## 8. As restrições que o código do backend impôs

Duas decisões não foram escolha de infraestrutura.

**`NODE_ENV=development`, de propósito.** A imagem define
`ENV NODE_ENV=production`. Nesse modo, a validação em
[`backend/src/config/validacao-env.ts`](../backend/src/config/validacao-env.ts)
exige `JWT_SECRET`, `RECUPERACAO_CODIGO_SECRET`, `BREVO_API_KEY` e
`BREVO_SENDER_EMAIL`, e a API **nem sobe** sem as quatro. Cadastrar um remetente
no Brevo para uma demonstração de 5 minutos não se paga. O `JWT_SECRET` continua
vindo do parâmetro mesmo assim, para os tokens não serem assinados com o segredo
que está no repositório.

**Migrations chamando o Prisma pelo `node`.** O runtime **não tem `npx`**: o
`Dockerfile` remove `npm`, `npx`, `corepack` e `yarn` do estágio final (eram 41
dos 43 achados HIGH/CRITICAL do Trivy). Então o CLI é chamado direto:

```sh
node node_modules/prisma/build/index.js migrate deploy
```

O binário do schema engine **não está na imagem** — o CLI o baixa sob demanda na
primeira execução. Isso cria uma **dependência de saída para a internet** além do
Docker Hub (`binaries.prisma.sh`). Numa sub-rede pública da VPC padrão isso é
automático; numa sub-rede privada sem NAT as migrations quebram, e o sintoma vai
parecer "a pilha deu timeout", não "falta internet".

## 9. Isto não é produção

- **Sem volume e sem backup.** Excluir a pilha apaga os dados. Na demo isso é a conclusão, não um defeito.
- **Senha do Postgres fixa** no script de inicialização.
- **O `JwtSecret` fica no user-data da instância**, legível por quem tiver acesso à instância ou ao IMDS, apesar do `NoEcho`. `NoEcho` protege a API do CloudFormation, não a instância. (A pilha local corrige isso gerando o segredo no Secrets Manager — veja [`comandos.md`](comandos.md).)
- **Porta 3000 aberta para a internet, sem TLS.**
- **Sem porta 22 e sem perfil de IAM**, para manter o modelo em dois recursos. O preço: não há SSH nem Session Manager para ler o `/var/log/cloud-init-output.log` quando algo falha. Para depurar, adicione um `AWS::IAM::Role` com `AmazonSSMManagedInstanceCore` e um `AWS::IAM::InstanceProfile`.
- **O banco sobe vazio** (seção 6).
- **O sinal de sucesso prova menos do que parece.** O `curl` final valida "a API responde", e só.
- **Banco na mesma instância de propósito:** com Amazon RDS a criação da pilha demora vários minutos a mais e atrapalha a demonstração ao vivo.

## 10. Como isso foi verificado

| O que | Resultado |
| --- | --- |
| Sintaxe e semântica do modelo | `cfn-lint`, sem achados |
| O `UserData` renderizado | `Fn::Sub` resolvido à mão + `bash -n`: válido, nenhum `${…}` sobrando |
| A sequência de inicialização | Imagem construída do `backend/Dockerfile`, script rodado localmente: 3 migrations, `/api/health` → `ok` |
| **A pilha de verdade, na AWS** | Criada em `sa-east-1`: `/api/health` 200 em 142 ms; `/api/docs` 200; `GET /api/destinos` 200; rota protegida → 401 |
| O código no ar é o do repositório | `/api/docs-json` comparado com `backend/openapi.json`: **idêntico byte a byte**, 32 rotas |
| O caminho de escrita e o JWT | `POST /api/auth/registrar` → `login` → `GET /api/usuarios/eu`: 201, token de 196 chars, 200 |
| O que o `/api/health` realmente prova | Apontado para um Postgres sem migrations: responde `"banco":"ok"` mesmo assim, enquanto `/api/destinos` dá 500 |

Dois achados que mudaram o modelo: o **laço de espera no `/api/health` é
necessário** (na primeira tentativa o `curl` devolveu `Empty reply from server` —
a porta já aceitava conexão, mas o Nest ainda subia), e o **laço do `pg_isready`
também** (sem ele o `migrate deploy` erra na primeira tentativa).

## 11. Se algo der errado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `CREATE_FAILED` com *"Received FAILURE signal"* | Nome ou tag de imagem errados, e o `docker pull` não acha nada | Confira `ImagemBackend` e `TagImagem` na aba **Parameters** |
| `CREATE_FAILED` logo no início, sem sinal | A conta não tem VPC padrão na região | Troque de região ou crie a VPC padrão |
| `CREATE_IN_PROGRESS` por 10 min e falha por timeout | O `cfn-signal` nunca chegou | Em geral é saída de internet: a instância precisa alcançar o Docker Hub **e** o `binaries.prisma.sh` (seção 8) |
| Swagger carrega mas `"banco"` vem `"indisponivel"` | O contêiner do Postgres caiu depois das migrations | Recrie a pilha |

Quando a criação falha, o CloudFormation faz rollback e remove a instância,
apagando o log junto. Para investigar, desmarque **"Rollback on failure"** nas
opções avançadas **antes** de criar a pilha.

## 12. Custo

Uma `t3.micro` mais o tráfego de saída, pelos minutos em que a pilha existir —
centavos. O risco não é o preço da demo, é esquecer a pilha no ar.
