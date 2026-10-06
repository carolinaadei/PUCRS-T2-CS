# Fluxo da implementação — `viajajunto-demo.yaml`

Por que este modelo existe, o que ele declara e em que ordem as coisas acontecem
quando a pilha é criada. Para apresentar, use o [`demo.md`](demo.md).

---

## 1. O problema que isso resolve

O CI já constrói a imagem do backend, passa por todos os portões e a publica no
Docker Hub. Mas nenhum passo pegava essa imagem e a executava em algum lugar: o
artefato ficava no registro, e era isso. Este modelo é o passo que faltava.

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

A imagem é entrada do modelo, não algo que ele constrói. Quem decide qual versão
sobe é o parâmetro `TagImagem` — `latest` na `main`, ou uma tag `vX.Y.Z`.

---

## 2. O que o modelo declara

Cinco parâmetros, dois recursos, duas saídas. As setas são as dependências que o
CloudFormation usa para ordenar a criação:

```
Parameters                      Resources                      Outputs
──────────                      ─────────                      ───────
ImagemBackend ──┐
TagImagem ──────┼──► UserData ──┐
JwtSecret ──────┘               │
                                ▼
TipoInstancia ──────────►  InstanciaDemo ──► PublicDnsName ──┬─► UrlSwagger
AmiAmazonLinux ─────────►       ▲                            └─► UrlHealth
                                │ SecurityGroupIds
                          GrupoSeguranca  (ingress tcp/3000)
```

| Recurso | Papel |
| --- | --- |
| `GrupoSeguranca` | Libera só a porta 3000. Sem `VpcId`, nasce na VPC padrão da conta. |
| `InstanciaDemo` | Roda o `UserData`. Sem `SubnetId`, a EC2 escolhe uma sub-rede padrão — que atribui IP público automaticamente, o que é o que faz o `PublicDnsName` das saídas existir. |

Três detalhes que não aparecem no desenho:

- **`AmiAmazonLinux` é um parâmetro do tipo SSM**
  (`AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>`). O CloudFormation resolve o
  caminho público da AMI do Amazon Linux 2023 para o ID correto **na região da
  pilha**. É o que dispensa uma seção `Mappings` com um ID por região, que
  envelhece a cada atualização da imagem.
- **`JwtSecret` tem `NoEcho: true`**, então o console o mascara e a API do
  CloudFormation não o devolve ao descrever a pilha.
- **A porta 5432 nunca é publicada no host.** O banco é alcançado apenas pelo
  nome `postgres` dentro da rede Docker, então nem o grupo de segurança precisa
  de regra para ele.

---

## 3. A sequência de inicialização

Todo o trabalho está no `UserData`, que o cloud-init executa uma vez, no primeiro
boot. O script roda com `set -euxo pipefail`: qualquer comando que falhe aborta
tudo, e o `-x` deixa cada linha executada no log.

```
   t=0     dnf install docker aws-cfn-bootstrap
             │
             ├─► trap EXIT: cfn-signal  ──────────────┐  (armado aqui;
             │                                        │   dispara na saída,
   t≈30s   systemctl enable --now docker              │   com sucesso ou erro)
             │                                        │
           docker network create viajajunto           │
             │                                        │
           docker run -d postgres:16-alpine           │
             │                                        │
           espera pg_isready  (até 60 × 2s)           │
             │                                        │
   t≈1min  docker pull <imagem>:<tag>   ◄── o passo mais longo
             │                                        │
           docker run --rm ... migrate deploy         │
             │                                        │
   t≈4min  docker run -d backend  (-p 3000:3000)      │
             │                                        │
           espera /api/health  (até 60 × 5s)          │
             │                                        │
           curl final  ──► decide o código de saída ──┘
                                                      │
                                                      ▼
                                        CloudFormation: CREATE_COMPLETE
                                                     ou CREATE_FAILED
```

Passo a passo, com o motivo de cada um:

| # | Comando | Por que está aí |
| --- | --- | --- |
| 1 | `dnf install -y docker aws-cfn-bootstrap` | O `cfn-signal` vem no `aws-cfn-bootstrap`, que o Amazon Linux 2023 **não** traz pré-instalado (o Amazon Linux 2 trazia). |
| 2 | `trap '… cfn-signal -e $?' EXIT` | Armado antes de qualquer coisa que possa falhar. Na saída do script o `$?` já é o código do comando que quebrou, então falha vira `CREATE_FAILED` imediato em vez de timeout de 10 minutos. |
| 3 | `docker network create viajajunto` | Rede própria dá resolução de nome entre contêineres: a API alcança o banco pelo host `postgres`. A rede `bridge` padrão não faz isso. |
| 4 | `docker run -d postgres:16-alpine` | O mesmo Postgres do `backend/docker-compose.yml`, com os mesmos usuário, senha e base — o ambiente de demo não divergir do local é metade do valor disso. |
| 5 | laço `pg_isready` | O contêiner sobe antes de o Postgres aceitar conexões. Sem esta espera, o passo 7 falha na primeira tentativa e derruba a pilha. O teste fica dentro de um `if`, porque uma falha solta com `set -e` abortaria o script. |
| 6 | `docker pull` | Explícito, para o download ficar visível como um passo próprio no log. |
| 7 | `migrate deploy` em contêiner efêmero | O banco nasce vazio. Detalhado na seção 4. |
| 8 | `docker run -d` do backend | As variáveis de ambiente estão na seção 4. |
| 9 | laço no `/api/health` + `curl` final | O laço espera; o `curl` depois dele é quem **decide**. Se o laço esgotar, o `curl` falha, o `trap` sinaliza erro e a pilha não fica "pronta" mentindo. |

Os dois contêineres sobem com `--restart unless-stopped`, então um reboot da
instância os traz de volta. O `UserData` **não** roda de novo nesse caso — o
cloud-init executa uma vez por instância.

---

## 4. As restrições que o código do backend impôs

Duas decisões não foram escolha de infraestrutura: o código do backend as
obrigou.

### `NODE_ENV=development`, de propósito

A imagem define `ENV NODE_ENV=production` no `Dockerfile`. Nesse modo, a
validação em [`backend/src/config/validacao-env.ts`](../backend/src/config/validacao-env.ts)
exige `JWT_SECRET`, `RECUPERACAO_CODIGO_SECRET`, `BREVO_API_KEY` e
`BREVO_SENDER_EMAIL` — e a API **nem sobe** sem as quatro, porque a validação
roda no boot (`validateSync` lança e derruba o processo).

Cadastrar e validar um remetente de e-mail no Brevo só para uma demonstração de
5 minutos não se paga. Em `development` essas variáveis caem num padrão e a API
apenas avisa no log:

```
WARN [Bootstrap] Sem configuracao para: RECUPERACAO_CODIGO_SECRET, BREVO_API_KEY,
BREVO_SENDER_EMAIL. Usando padroes de desenvolvimento …
```

O `JWT_SECRET` continua vindo do parâmetro mesmo assim. Em `development` ele
seria opcional, mas aceitar o padrão `'segredo-de-desenvolvimento'` do
[`configuracao.ts`](../backend/src/config/configuracao.ts) significaria tokens
assinados com um segredo que está no repositório.

O `CORS_ORIGIN='*'` entra pelo mesmo motivo prático: o padrão do código é
`http://localhost:3001`, que não existe neste ambiente. O `main.ts` já trata esse
valor (`credentials: origem !== '*'`).

### Migrations antes da API, chamando o Prisma pelo `node`

O banco nasce vazio, então as migrations têm de rodar antes de a API subir. Elas
rodam num contêiner efêmero da **própria imagem** — ela carrega o
`prisma/schema.prisma` e a pasta `prisma/migrations` justamente para isso, como o
`Dockerfile` documenta.

O comando não é `npx prisma migrate deploy` porque o runtime **não tem `npx`**: o
`Dockerfile` remove `npm`, `npx`, `corepack` e `yarn` do estágio final (eram 41
dos 43 achados HIGH/CRITICAL do Trivy). Então o CLI é chamado direto:

```sh
node node_modules/prisma/build/index.js migrate deploy
```

**Uma consequência que vale saber:** o binário do schema engine **não está na
imagem**. O estágio `deps` instala com `npm ci --omit=dev --ignore-scripts`, e é o
`postinstall` do `@prisma/engines` que baixaria os engines. Verificado na imagem
construída — o diretório tem só `LICENSE README.md dist package.json scripts`.

O `migrate deploy` funciona de todo modo, porque o CLI baixa o engine sob demanda
na primeira execução. Isso cria uma **dependência de saída para a internet** além
do Docker Hub:

```
binaries.prisma.sh/all_commits/<hash>/linux-musl-openssl-3.0.x/schema-engine.gz
```

Confirmado por teste numa rede Docker `--internal`: sem internet, o passo falha
com `getaddrinfo EAI_AGAIN binaries.prisma.sh`. Numa sub-rede pública da VPC
padrão isso é automático; se alguém mover esta instância para uma sub-rede
privada sem NAT, as migrations quebram — e o sintoma vai parecer "a pilha deu
timeout", não "falta internet".

---

## 5. Decisões de projeto

| Decisão | Por quê | O que foi descartado |
| --- | --- | --- |
| Postgres na mesma instância | Com Amazon RDS a criação da pilha leva vários minutos a mais, o que atrapalha uma demonstração ao vivo | `AWS::RDS::DBInstance` |
| `CreationPolicy` + `cfn-signal` | Sem isso a pilha chegaria a `CREATE_COMPLETE` em ~30s, enquanto a API precisa de 3 a 5 min. O apresentador abriria a URL e veria *connection refused* | Deixar a pilha "pronta" cedo |
| Parâmetro SSM para a AMI | Resolve o ID certo por região, sem manutenção | `Mappings` com um ID por região |
| Sem `VpcId`/`SubnetId` | Usa a VPC padrão e dispensa parâmetros de rede, que não agregam nada à demo | Parâmetros de VPC e sub-rede |
| 5432 não publicada | O banco só serve à API; o grupo de segurança abre apenas a 3000 | Publicar 5432 "por conveniência" |
| Sem porta 22 e sem perfil de IAM | Mantém o modelo em dois recursos | Papel IAM + `AmazonSSMManagedInstanceCore` para ler logs |

A última é a que mais dói na prática: sem SSH nem Session Manager, não há como
ler o `/var/log/cloud-init-output.log` quando algo falha. Foi uma troca
consciente por simplicidade; o [`README.md`](README.md) diz o que adicionar se
você precisar depurar.

---

## 6. Como isso foi verificado

O modelo foi testado antes de ser commitado, não só escrito:

| O que | Como | Resultado |
| --- | --- | --- |
| Sintaxe e semântica do modelo | `cfn-lint` | Sem achados |
| O `UserData` renderizado | `Fn::Sub` resolvido à mão, depois `bash -n` | Sintaxe válida, nenhum `${…}` sobrando — nenhuma variável de shell é confundida com parâmetro |
| A sequência inteira de inicialização | Imagem construída do `backend/Dockerfile` e o script renderizado rodado localmente | 3 migrations aplicadas; `/api/health` → `{"status":"ok","banco":"ok"}`; `/api/docs` → 200 |
| O `migrate deploy` na imagem real | Contêiner efêmero contra um Postgres novo | 3 migrations em ~8s, **sem** o binário do engine na imagem |
| A dependência de internet | Rede Docker `--internal` | Falha com `EAI_AGAIN binaries.prisma.sh` — é o que prova o download sob demanda |

Dois achados do teste que mudaram o modelo:

- **O laço de espera no `/api/health` é necessário.** Na primeira tentativa o
  `curl` devolveu `Empty reply from server` — a porta já aceitava conexão, mas o
  Nest ainda estava subindo. Sem o laço, o sinal sairia como falha.
- **O laço do `pg_isready` também.** Sem ele o `migrate deploy` erra na primeira
  tentativa.

---

## 7. Limitações conhecidas

Isto é um ambiente de demonstração. Nada aqui é adequado a produção:

- **Sem volume e sem backup.** O banco vive dentro do contêiner; excluir a pilha
  apaga os dados. Na demo isso é a conclusão, não um defeito.
- **Senha do Postgres fixa** no script de inicialização.
- **O `JwtSecret` fica no user-data da instância**, legível por quem tiver acesso
  à instância ou ao IMDS, apesar do `NoEcho`. `NoEcho` protege a API do
  CloudFormation, não a instância.
- **Porta 3000 aberta para a internet, sem TLS.**
- **Sem acesso a log** (seção 5).
- **O `Try it out` do Swagger não funciona**: o `servers` do documento OpenAPI
  está fixo em `http://localhost:3000` em
  [`backend/src/config/swagger.ts`](../backend/src/config/swagger.ts).
- **O sinal de sucesso prova menos do que parece.** O `/api/health` responde 200
  mesmo com o banco fora (`"status": "degradado"`), então o `curl -fsS` final
  valida "a API responde", não "o banco responde". Na prática a janela é
  estreita, porque o `migrate deploy` segundos antes já exerceu o banco. Para
  fechá-la, bastaria encadear `| grep -q '"banco":"ok"'` no `curl` final.

---

## 8. Onde mexer se…

| Você quer | Mexa em |
| --- | --- |
| Trocar a porta exposta | `SecurityGroupIngress`, o `-p` do `docker run` e as duas `Outputs` |
| Preservar os dados entre pilhas | Um volume Docker no contêiner do Postgres — e lembre que excluir a pilha ainda apaga a instância |
| Usar Amazon RDS | Um `AWS::RDS::DBInstance` e a `DATABASE_URL` apontando para o endpoint dele; aumente o `Timeout` do `CreationPolicy` |
| Ler os logs da instância | `AWS::IAM::Role` com `AmazonSSMManagedInstanceCore` + `AWS::IAM::InstanceProfile` |
| Rodar em sub-rede privada | Um NAT, por causa do Docker Hub e do `binaries.prisma.sh` (seção 4) |
| Subir uma versão específica | Só o parâmetro `TagImagem` |
