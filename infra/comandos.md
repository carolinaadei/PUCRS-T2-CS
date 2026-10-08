# Comandos — pilha local no MiniStack

Receita para criar, exercitar e destruir a pilha do
[`viajajunto-local.yaml`](viajajunto-local.yaml) no
[MiniStack](https://ministack.org). Só precisa de Docker: nenhuma conta, nenhuma
credencial, nenhuma AWS CLI instalada.

Para entender *o que* esta pilha é, veja [`sobre-a-demo.md`](sobre-a-demo.md).

> **No PowerShell**, troque o `\` do fim das linhas pelo acento grave (`` ` ``),
> ou cole cada comando numa linha só. O `\` é sintaxe de shell POSIX e dá erro de
> parser no PowerShell.

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

Vale rodar na apresentação: a mensagem de erro é o próprio conteúdo.

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

## 7. Limpar

```bash
# exclui as duas pilhas - leva os recursos junto, inclusive o bucket com objeto
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-local
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-dev

# derruba o emulador - o estado e em memoria, entao isto zera tudo
docker compose down
```

---

## Divergências medidas no MiniStack 1.5.22

Três pontos em que o emulador difere da AWS. Nenhum impede a demonstração, mas
não vale afirmar o contrário na frente da turma.

| O que | No MiniStack | Na AWS real |
| --- | --- | --- |
| `ExcludePunctuation: true` | **Ignorado** — o segredo vem com `" # $ % ' + , - ; < ] { ~` | Respeitado |
| `!Ref` num `SecretsManager::Secret` | Devolve o **nome** (`viajajunto/local/jwt`) | Devolve o ARN |
| `Replacement` no change set | `Conditional` | `False` (`RetentionInDays` é *"No interruption"*) |

> A pontuação no segredo tem efeito prático: o valor pode conter acento grave,
> que num comando PowerShell é caractere de escape. Use **aspas simples** ao
> passá-lo adiante.
