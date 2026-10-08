# Comandos — pilha local no MiniStack

Para entender *o que* esta pilha é, veja [`sobre-a-demo.md`](sobre-a-demo.md).

---

## 1. Subir o emulador

```bash
# entra na pasta do compose (a partir da raiz do repositorio)
cd infra/ministack

# sobe o MiniStack em background
docker compose up -d

# confirma que esta pronto - espere STATUS = Up (healthy)
docker compose ps
```

Todos os comandos seguintes rodam de dentro de `infra/ministack`.

## 2. Criar a pilha

```bash
# cria a pilha a partir do modelo (o caminho /infra e o volume do compose)
docker compose run --rm aws cloudformation create-stack \
  --stack-name viajajunto-local \
  --template-body file:///infra/viajajunto-local.yaml

# le o status - deve virar CREATE_COMPLETE em ~20 segundos
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local --query 'Stacks[0].StackStatus' --output text

# lista as seis saidas da pilha, com os nomes reais dos recursos
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text
```

## 3. Provar que os recursos são reais

Não basta a pilha dizer `CREATE_COMPLETE` — estes comandos **usam** os recursos.

```bash
# grava um objeto no bucket de midia
docker compose run --rm aws s3api put-object \
  --bucket viajajunto-local-midia \
  --key fotos/gramado.jpg --body /infra/viajajunto-local.yaml

# lista o que ha no bucket, com o tamanho de cada objeto
docker compose run --rm aws s3api list-objects-v2 \
  --bucket viajajunto-local-midia \
  --query 'Contents[].[Key,Size]' --output text

# descobre a URL da fila sem precisar decora-la
docker compose run --rm aws sqs get-queue-url \
  --queue-name viajajunto-local-notificacoes --query QueueUrl --output text

# envia uma mensagem para a fila de notificacoes
docker compose run --rm aws sqs send-message \
  --message-body 'convite:viagem=42' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes

# recebe a mensagem de volta - deve sair exatamente o que foi enviado
docker compose run --rm aws sqs receive-message --output text \
  --query 'Messages[0].Body' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes

# le o segredo que o CloudFormation GEROU (nao recebeu como parametro)
docker compose run --rm aws secretsmanager get-secret-value \
  --secret-id viajajunto/local/jwt --query SecretString --output text

# le o parametro de configuracao nao-secreta
docker compose run --rm aws ssm get-parameter \
  --name /viajajunto/local/CORS_ORIGIN --query Parameter.Value --output text

# mostra o grupo de logs e a retencao aplicada (retentionInDays: 7)
docker compose run --rm aws logs describe-log-groups \
  --log-group-name-prefix /viajajunto/local --output json
```

> **A URL da fila tem duas formas.** Dentro da rede do Compose o host é
> `ministack` — é a forma usada acima, porque os comandos rodam lá dentro. A
> saída da pilha traz `localhost`, que vale para quem chama de fora do Docker.

## 4. Mostrar que a `Condition` é avaliada

```bash
# cria uma segunda pilha com Ambiente=dev, que liga o versionamento do bucket
docker compose run --rm aws cloudformation create-stack \
  --stack-name viajajunto-dev \
  --template-body file:///infra/viajajunto-local.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=dev

# em dev a resposta e {"Status": "Enabled"}
docker compose run --rm aws s3api get-bucket-versioning --bucket viajajunto-dev-midia

# em local a resposta vem VAZIA - como a AWS representa bucket nunca versionado
docker compose run --rm aws s3api get-bucket-versioning --bucket viajajunto-local-midia
```

## 5. Change set — a prévia antes de executar

```bash
# calcula o que mudaria ao trocar a retencao de 7 para 30 dias, sem aplicar nada
docker compose run --rm aws cloudformation create-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --use-previous-template \
  --parameters ParameterKey=RetencaoLogsDias,ParameterValue=30

# mostra o diff: dos seis recursos, o CloudFormation aponta exatamente um
#   ->  GrupoLogsApi   Modify   Conditional
docker compose run --rm aws cloudformation describe-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --query 'Changes[].ResourceChange.[LogicalResourceId,Action,Replacement]' --output text

# aplica o change set
docker compose run --rm aws cloudformation execute-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao

# prova que a mudanca chegou ao RECURSO: retentionInDays virou 30
docker compose run --rm aws logs describe-log-groups \
  --log-group-name-prefix /viajajunto/local --output json
```

## 6. Mostrar que o modelo da AWS não roda aqui

A mensagem de erro é o próprio conteúdo.

```bash
# tenta criar a pilha de EC2 no emulador - falha na PRIMEIRA barreira:
#   ValidationError: Parameter 'AmiAmazonLinux' failed to resolve:
#   SSM parameter '/aws/service/ami-amazon-linux-latest/...' does not exist
docker compose run --rm aws cloudformation create-stack --stack-name demo \
  --template-body file:///infra/viajajunto-demo.yaml \
  --parameters ParameterKey=ImagemBackend,ParameterValue=exemplo/viajajunto-backend \
               ParameterKey=JwtSecret,ParameterValue=abcdefghijklmnopqrstuvwxyz012345

# semeia o parametro da AMI a mao, para passar da primeira barreira
docker compose run --rm aws ssm put-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --type String --value ami-0abcdef1234567890 --overwrite

# tenta de novo - agora falha na SEGUNDA barreira, que e a definitiva:
#   ValidationError: Template format error:
#   Unrecognized resource types: [AWS::EC2::Instance]
docker compose run --rm aws cloudformation create-stack --stack-name demo \
  --template-body file:///infra/viajajunto-demo.yaml \
  --parameters ParameterKey=ImagemBackend,ParameterValue=exemplo/viajajunto-backend \
               ParameterKey=JwtSecret,ParameterValue=abcdefghijklmnopqrstuvwxyz012345
```

O porquê está na seção 3 do [`sobre-a-demo.md`](sobre-a-demo.md).

## 7. URLs para abrir no navegador

Estas quatro funcionam com a pilha criada (seção 2) e o objeto gravado (seção 3).
Todas testadas, todas devolvem `200`:

| URL | O que mostrar para a turma |
| --- | --- |
| `http://localhost:4566/_ministack/health` | JSON com os **89 serviços** que o emulador oferece. Abra primeiro: prova que o MiniStack está no ar. |
| `http://localhost:4566/` | XML `ListAllMyBucketsResult` — o bucket que **o CloudFormation** criou, com nome, região e ARN. |
| `http://localhost:4566/viajajunto-local-midia` | XML `ListBucketResult` — a chave `fotos/gramado.jpg`, o `Size` e o `ETag`. |
| `http://localhost:4566/viajajunto-local-midia/fotos/gramado.jpg` | O **arquivo em si**, baixado pelo navegador. Verificado: 5285 bytes, idêntico byte a byte ao original. |

A última é a mais forte: um recurso declarado em YAML, servindo um arquivo de
verdade por HTTP, sem conta na AWS.

```bash
# alternativa pelo terminal, se preferir nao sair do shell
# o -s tira a barra de progresso, que poluiria a tela na apresentacao
curl -s http://localhost:4566/_ministack/health
curl -s http://localhost:4566/viajajunto-local-midia
```

> **O que NÃO abre no navegador:** a fila (dá `404`), o segredo e o parâmetro do
> SSM. Eles exigem requisição assinada — use os comandos da seção 3.
>
> **Esta pilha não sobe API nenhuma.** As URLs do Swagger, do `/api/health` e do
> `/api/destinos` são da demonstração na AWS real: veja a seção 6 do
> [`sobre-a-demo.md`](sobre-a-demo.md).

## 8. Limpar

```bash
# exclui as duas pilhas - leva os recursos junto, inclusive o bucket com objeto
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-local
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-dev

# derruba o emulador - o estado e em memoria, entao isto zera tudo
docker compose down
```