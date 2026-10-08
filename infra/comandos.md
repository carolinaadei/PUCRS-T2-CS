# Comandos — pilha local no MiniStack

Como criar, exercitar e destruir a pilha do
[`viajajunto-local.yaml`](viajajunto-local.yaml) no
[MiniStack](https://ministack.org), um emulador local de serviços da AWS: MIT,
sem cadastro e sem token.

**Só precisa de Docker.** Nenhuma credencial, nenhuma conta, nenhuma AWS CLI
instalada — o serviço `aws` do [`ministack/compose.yml`](ministack/compose.yml)
está num profile e já sai apontado para o emulador.

Para entender *o que* esta pilha é e por que ela existe separada da demonstração
na AWS, veja [`sobre-a-demo.md`](sobre-a-demo.md).

> **PowerShell:** os blocos abaixo usam `\` para quebrar linha, que é sintaxe de
> shell POSIX e **dá erro de parser no PowerShell**. Use o acento grave
> (`` ` ``) no lugar, ou cole cada comando numa única linha. O resto é igual —
> verificado: vírgula em `ParameterKey=…,ParameterValue=…` e colchetes em
> `--query` passam sem aspas extras.

---

## Subir o emulador

```bash
cd infra/ministack
docker compose up -d
docker compose ps          # espere STATUS = Up (healthy)
```

Todo comando daqui em diante é `docker compose run --rm aws <subcomando>`, de
dentro de `infra/ministack`.

## Criar a pilha

```bash
docker compose run --rm aws cloudformation create-stack \
  --stack-name viajajunto-local \
  --template-body file:///infra/viajajunto-local.yaml
```

```bash
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local --query 'Stacks[0].StackStatus' --output text
```

→ `CREATE_COMPLETE` em cerca de 20 segundos.

## Ver as saídas

```bash
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text
```

```
NomeBucketMidia         viajajunto-local-midia
UrlFilaNotificacoes     http://localhost:4566/000000000000/viajajunto-local-notificacoes
ArnFilaDLQ              arn:aws:sqs:us-east-1:000000000000:viajajunto-local-notificacoes-dlq
ReferenciaSegredoJwt    viajajunto/local/jwt
NomeParametroCors       /viajajunto/local/CORS_ORIGIN
NomeGrupoLogs           /viajajunto/local/api
```

## Provar que os recursos são reais

Não basta a pilha dizer `CREATE_COMPLETE`. Estes comandos usam os recursos:

```bash
# S3 — grava e lê
docker compose run --rm aws s3api put-object --bucket viajajunto-local-midia \
  --key fotos/gramado.jpg --body /infra/viajajunto-local.yaml
docker compose run --rm aws s3api list-objects-v2 --bucket viajajunto-local-midia \
  --query 'Contents[].[Key,Size]' --output text

# SQS — envia e recebe
docker compose run --rm aws sqs send-message --message-body 'convite:viagem=42' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes
docker compose run --rm aws sqs receive-message --output text \
  --query 'Messages[0].Body' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes

# Secrets Manager — o segredo que o CloudFormation gerou
docker compose run --rm aws secretsmanager get-secret-value \
  --secret-id viajajunto/local/jwt --query SecretString --output text

# SSM — o parâmetro de configuração
docker compose run --rm aws ssm get-parameter \
  --name /viajajunto/local/CORS_ORIGIN --query Parameter.Value --output text

# CloudWatch Logs — a retenção aplicada
docker compose run --rm aws logs describe-log-groups \
  --log-group-name-prefix /viajajunto/local --output json
```

> A URL da fila tem **duas formas**: dentro da rede do Compose o host é
> `ministack`; a saída da pilha traz `localhost`, que é a forma válida para quem
> chama de fora do Docker. Os comandos acima rodam dentro da rede, por isso usam
> `ministack`. Se não quiser decorar, use
> `sqs get-queue-url --queue-name viajajunto-local-notificacoes`.

## A condição, pelos dois lados

Mostra que a `Condition` do modelo é avaliada de verdade:

```bash
docker compose run --rm aws cloudformation create-stack --stack-name viajajunto-dev \
  --template-body file:///infra/viajajunto-local.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=dev

docker compose run --rm aws s3api get-bucket-versioning --bucket viajajunto-dev-midia
docker compose run --rm aws s3api get-bucket-versioning --bucket viajajunto-local-midia
```

Em `dev` a resposta é `{"Status": "Enabled"}`; em `local` ela vem **vazia**, que é
como a AWS representa um bucket nunca versionado.

## Change set — a prévia antes de executar

```bash
docker compose run --rm aws cloudformation create-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --use-previous-template \
  --parameters ParameterKey=RetencaoLogsDias,ParameterValue=30

docker compose run --rm aws cloudformation describe-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --query 'Changes[].ResourceChange.[LogicalResourceId,Action,Replacement]' --output text
```

```
GrupoLogsApi	Modify	Conditional
```

O ponto é o **isolamento**: dos seis recursos da pilha, o CloudFormation aponta
exatamente um. Para fechar o ciclo e provar que o update chega ao recurso:

```bash
docker compose run --rm aws cloudformation execute-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao

docker compose run --rm aws logs describe-log-groups \
  --log-group-name-prefix /viajajunto/local --output json
```

O `retentionInDays` sai de `7` e vira `30` **no recurso**, não só no status da
pilha.

## Encerrar

```bash
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-local
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-dev
docker compose down
```

A exclusão leva os seis recursos junto, inclusive o bucket com objeto dentro. O
estado do emulador é em memória, então `docker compose down` é o reset
definitivo — instantâneo e repetível.

---

## O modelo da AWS não roda aqui

Aplicar o [`viajajunto-demo.yaml`](viajajunto-demo.yaml) no MiniStack falha, em
duas barreiras. Vale rodar na apresentação, porque a mensagem de erro é o próprio
conteúdo:

```bash
docker compose run --rm aws cloudformation create-stack --stack-name demo \
  --template-body file:///infra/viajajunto-demo.yaml \
  --parameters ParameterKey=ImagemBackend,ParameterValue=exemplo/viajajunto-backend \
               ParameterKey=JwtSecret,ParameterValue=abcdefghijklmnopqrstuvwxyz012345
```

Primeiro:

```
ValidationError: Parameter 'AmiAmazonLinux' failed to resolve: SSM parameter
'/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64'
does not exist
```

E se você semear o parâmetro à mão com `ssm put-parameter`, a segunda:

```
ValidationError: Template format error: Unrecognized resource types:
[AWS::EC2::Instance]
```

O porquê está em [`sobre-a-demo.md`](sobre-a-demo.md).

---

## Divergências medidas no MiniStack 1.5.22

Três coisas em que o emulador difere da AWS. Nenhuma impede a demonstração, mas
não vale afirmar o contrário na frente da turma:

| O que | No MiniStack | Na AWS real |
| --- | --- | --- |
| `ExcludePunctuation: true` | **Ignorado** — o segredo vem com `" # $ % ' + , - ; < ] { ~` | Respeitado |
| `!Ref` num `SecretsManager::Secret` | Devolve o **nome** (`viajajunto/local/jwt`) | Devolve o ARN |
| `Replacement` no change set | `Conditional` | `False` (`RetentionInDays` é *"No interruption"*) |

> A pontuação no segredo tem efeito prático: o valor pode conter acento grave,
> que num comando PowerShell é caractere de escape. Use **aspas simples** ao
> passá-lo adiante.
