# Infraestrutura: CloudFormation no MiniStack

Como o ViajaJunto sobe inteiro com um comando, o que o CloudFormation cria e por
que a API consome esses recursos do mesmo jeito que consumiria na AWS.

## O que é o MiniStack

O [MiniStack](https://ministack.org) é um emulador dos serviços da AWS (S3, SQS,
SES, Secrets Manager, SSM, CloudFormation e dezenas de outros) que roda num único
contêiner, na porta `4566`. É software livre (MIT), não exige conta nem token, e
responde às mesmas APIs da AWS: o AWS CLI e os SDKs funcionam apontando para ele.

No projeto ele faz o papel da "conta AWS" de desenvolvimento e do CI.

## O que sobe com `docker compose up`

```
docker compose up -d --build --wait
 │
 ├─ postgres      PostgreSQL 16 (banco da API)
 ├─ ministack     ministackorg/ministack:1.5.37, com estado em volume
 ├─ provisionar   aws cloudformation deploy infra/cloudformation/viajajunto.yaml
 ├─ migrar        prisma migrate deploy + seed            (roda uma vez e sai)
 ├─ api           http://localhost:3000/api/v1            (espera provisionar e migrar)
 └─ worker        entrega os e-mails da fila SQS
```

| Serviço | Imagem | Quando termina |
| ------- | ------ | -------------- |
| `postgres` | `postgres:16-alpine` | fica no ar; `healthy` com `pg_isready` |
| `ministack` | `ministackorg/ministack:1.5.37` | fica no ar; `healthy` com `/_ministack/health` |
| `provisionar` | `amazon/aws-cli:2.39.3` | sai com 0 quando a pilha está pronta |
| `migrar` | estágio `ferramentas` do `backend/Dockerfile` | sai com 0 depois das migrations e do seed |
| `api` | estágio `runtime` do `backend/Dockerfile` | fica no ar; `healthy` com `/api/health/live` |
| `worker` | a mesma imagem da API, com `node dist/worker` | fica no ar; `healthy` enquanto o loop da fila gira |

O `--wait` só devolve o terminal com tudo `healthy` ou concluído com sucesso. Se a
pilha falhar, a API nem sobe: ela depende de `provisionar` com
`service_completed_successfully`.

## A pilha CloudFormation

Arquivo: [`infra/cloudformation/viajajunto.yaml`](https://github.com/carolinaadei/PUCRS-T2-CS/blob/dev/infra/cloudformation/viajajunto.yaml).
O nome dos recursos leva o parâmetro `Ambiente` (`local`, `dev` ou `prod`).

| Recurso | Tipo | Para que a API usa |
| ------- | ---- | ------------------ |
| `viajajunto-local-midia` | `AWS::S3::Bucket` + `BucketPolicy` | fotos de destinos e atividades. Leitura pública só no prefixo `publico/`, CORS liberado para o front |
| `viajajunto-local-emails` | `AWS::SQS::Queue` | fila dos e-mails a enviar |
| `viajajunto-local-emails-dlq` | `AWS::SQS::Queue` | e-mails que falharam 3 vezes |
| `nao-responda@viajajunto.local` | `AWS::SES::EmailIdentity` | remetente dos e-mails |
| `viajajunto/local/jwt` | `AWS::SecretsManager::Secret` | `JWT_SECRET`, **gerado** pela pilha |
| `viajajunto/local/recuperacao` | `AWS::SecretsManager::Secret` | `RECUPERACAO_CODIGO_SECRET`, gerado pela pilha |
| `/viajajunto/local/*` | `AWS::SSM::Parameter` (6) | `CORS_ORIGINS`, `PUBLIC_URL`, `S3_BUCKET_MIDIA`, `SQS_FILA_EMAILS`, `MAIL_PROVEDOR`, `EMAIL_REMETENTE` |
| `/viajajunto/local/api` | `AWS::Logs::LogGroup` | grupo de logs (retenção configurável) |

O `provisionar` usa `aws cloudformation deploy`, que cria a pilha na primeira vez e,
nas seguintes, aplica só o que mudou no modelo (via *change set*) — ou responde
`No changes to deploy`. Por isso ele roda em todo `up` sem efeito colateral.

## Como a API encontra os recursos

A API não tem nome de bucket, fila ou segredo escrito em lugar nenhum. O compose
passa só três coisas:

```yaml
AWS_ENDPOINT_URL: http://ministack:4566          # onde esta a "AWS"
CONFIG_AWS_SEGREDOS: viajajunto/local/jwt,viajajunto/local/recuperacao
CONFIG_AWS_PARAMETROS: /viajajunto/local/
```

No boot, antes de o Nest validar o ambiente, `carregarConfiguracaoDaAws`
([`src/config/configuracao-aws.ts`](https://github.com/carolinaadei/PUCRS-T2-CS/blob/dev/backend/src/config/configuracao-aws.ts))
lê os segredos do Secrets Manager e todos os parâmetros do caminho no SSM, e os
coloca no `process.env`. Variável definida explicitamente no ambiente sempre vence.
No compose (`NODE_ENV=production`), o log de boot sai em JSON, uma linha por
evento. Exemplo ilustrativo; `pid` e `timestamp` variam:

```json
{"level":"log","pid":1,"timestamp":1793808000000,"message":"Segredo viajajunto/local/jwt: JWT_SECRET","context":"ConfiguracaoAws"}
{"level":"log","pid":1,"timestamp":1793808000001,"message":"Parametros /viajajunto/local/: CORS_ORIGINS, EMAIL_REMETENTE, MAIL_PROVEDOR, PUBLIC_URL, S3_BUCKET_MIDIA, SQS_FILA_EMAILS","context":"ConfiguracaoAws"}
```

Com isso a API sobe com `NODE_ENV=production` no compose — com todas as exigências
de produção (segredos fortes, provedor de e-mail real) satisfeitas pela pilha.

## Os dois fluxos que passam pela "AWS"

### Upload de foto (S3)

```
front ──POST /api/v1/uploads──► API  (assina um formulario: chave, tipo, tamanho maximo)
front ──POST multipart─────────► S3   (o arquivo vai direto, sem passar pela API)
front ──PATCH fotoUrl──────────► API  (grava a urlPublica no destino ou na atividade)
```

O formulário é um *presigned POST*: a política assinada fixa o nome do objeto, o
`Content-Type` e o tamanho máximo, e é o próprio S3 que recusa o que sair disso
(`EntityTooLarge`, `AccessDenied`). Fora da AWS o formulário é assinado com
`S3_ENDPOINT_PUBLICO` (`http://localhost:4566`), porque é o navegador que o usa e
ele não resolve o nome `ministack`.

### E-mail (SQS → worker → SES)

```
API ──SendMessage──► viajajunto-local-emails ──► worker ──► SES
                             │ 3 falhas
                             ▼
                     viajajunto-local-emails-dlq
```

A API só publica e responde. O worker apaga a mensagem **depois** de entregar; se o
provedor falhar, ela reaparece na fila e é tentada de novo. No MiniStack o SES não
envia de verdade: os e-mails ficam em `http://localhost:4566/_ministack/ses/messages`
— é ali que se lê o código de recuperação de senha em desenvolvimento.

## Para que isso serve

1. **Mesmo código em desenvolvimento e na AWS.** Na AWS de verdade, o mesmo modelo
   sobe com `aws cloudformation deploy --parameter-overrides Ambiente=prod`, e a
   mesma imagem roda sem `AWS_ENDPOINT_URL` nem `S3_ENDPOINT_PUBLICO`. Não há
   `if (dev)` no código.
2. **Entrada fácil para quem faz o front.** `git clone` + `docker compose up`
   entrega API, banco migrado com dados de exemplo, upload de fotos e e-mails
   inspecionáveis, sem conta na AWS, sem conta no Brevo e sem custo.
3. **CI realista.** O job `Testes + cobertura` sobe Postgres e MiniStack como
   *service containers*, aplica a pilha e roda as suítes de integração: upload
   assinado, fila de e-mails e leitura de configuração são testados de ponta a ponta.
4. **Infraestrutura revisada em PR.** Mudar um recurso é mudar o YAML; o change set
   mostra o impacto antes de aplicar.
5. **Desacoplamento.** E-mail fora da requisição, com nova tentativa e DLQ.

## Comandos úteis

```bash
# Estado da pilha e saidas
docker compose run --rm --entrypoint aws provisionar cloudformation describe-stacks \
  --stack-name viajajunto-local --query 'Stacks[0].[StackStatus,Outputs]'

# Recursos criados
docker compose run --rm --entrypoint aws provisionar cloudformation list-stack-resources \
  --stack-name viajajunto-local --output table

# E-mails "enviados"
curl http://localhost:4566/_ministack/ses/messages

# Logs
docker compose logs -f api worker

# Derrubar tudo (o -v apaga banco, pilha e fotos)
docker compose down -v
```

## Limites do emulador

Medidos na versão 1.5.37 — valem para desenvolvimento, não para validar segurança:

- **O estado só é gravado num desligamento com folga.** O MiniStack grava a pilha,
  as filas e os segredos ao receber o SIGTERM, depois que as requisições em curso
  terminam — inclusive o *long polling* do worker, de até 10 s. Se o Docker o matar
  antes (o padrão pode ser de 1 s, como no Docker Desktop), um `restart` apaga tudo.
  Por isso o compose fixa `stop_grace_period: 30s` no MiniStack — não remova.
- **Autorização não é conferida por padrão.** O S3 do MiniStack aceita upload sem
  assinatura; a política do *presigned POST* (tamanho e tipo) é aplicada, mas
  permissões IAM e bucket policies só são testáveis na AWS (ou com `AUTH=true`).
- **`ExcludePunctuation` é ignorado** na geração de segredos. Irrelevante aqui,
  porque a API lê o valor pelo SDK.
- **A URL da fila usa o host do emulador** (`localhost`). Por isso, com
  `AWS_ENDPOINT_URL` definido, o cliente SQS usa o endpoint configurado
  (`useQueueUrlAsEndpoint: false`).
- **`AWS::EC2::Instance` não é suportado.** Subir a própria API como recurso da
  pilha fica para a AWS de verdade (ECS, App Runner ou EC2).
- **O RDS do MiniStack não é usado de propósito:** ele cria contêineres pelo socket
  do Docker, fora do ciclo de vida do compose. O Postgres fica como serviço do compose.
