# Ambiente MiniStack — CloudFormation sem conta na AWS

O [`viajajunto-local.yaml`](viajajunto-local.yaml) roda no
[MiniStack](https://ministack.org), um emulador local de serviços da AWS: MIT,
open source, sem cadastro e sem token. Ele existe para exercitar o ciclo inteiro
do CloudFormation — criar, prever, alterar, excluir — sem conta, sem credencial,
sem custo e sem rede.

Ele **não** substitui o [`viajajunto-demo.yaml`](viajajunto-demo.yaml): são dois
modelos com papéis diferentes, e a seção 1 explica por quê.

Tudo nesta página foi medido no MiniStack **1.5.22**, não suposto.

---

## 1. Por que dois modelos, e não um rodando nos dois lugares

A pergunta óbvia é por que não aplicar o `viajajunto-demo.yaml` no MiniStack. A
resposta é que o emulador **recusa o modelo**, e recusa bem — em duas barreiras
sucessivas.

A primeira aparece num emulador recém-subido, antes de qualquer recurso ser
tocado:

```
aws: [ERROR]: An error occurred (ValidationError) when calling the CreateStack
operation: Parameter 'AmiAmazonLinux' failed to resolve: SSM parameter
'/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64'
does not exist
```

O parâmetro público de AMI da AWS não existe no emulador, e ele **diz isso** em
vez de inventar um ID de AMI plausível. Se você contornar, semeando o parâmetro
à mão (`ssm put-parameter`), a segunda barreira aparece:

```
aws: [ERROR]: An error occurred (ValidationError) when calling the CreateStack
operation: Template format error: Unrecognized resource types:
[AWS::EC2::Instance]
```

`AWS::EC2::Instance` não está entre os tipos que o CloudFormation do MiniStack
reconhece, e tipo não reconhecido derruba a criação na hora.

**Isso é bom.** O `viajajunto-demo.yaml` é construído inteiro sobre uma EC2 que
executa Docker no `UserData` e devolve um `cfn-signal`; nada disso existe num
emulador, e o MiniStack diz exatamente isso em vez de fingir. A pilha não é
criada, nenhuma saída é inventada, e ninguém projeta no telão uma URL que não
existe.

Daí a separação:

| Modelo | Onde roda | Papel |
| --- | --- | --- |
| [`viajajunto-demo.yaml`](viajajunto-demo.yaml) | AWS real | Provar que a imagem que o CI publica vira um ambiente no ar. Insubstituível: o valor dele é a API respondendo. |
| [`viajajunto-local.yaml`](viajajunto-local.yaml) | MiniStack | Exercitar o CloudFormation em si, com tipos que o emulador reconhece. Reproduzível, offline, grátis. |

E a recusa **é conteúdo de apresentação**, não um detalhe a esconder: o emulador
cobre os serviços gerenciados, não a máquina virtual que você mesmo provisiona.
Mostrar a mensagem de erro e explicar por que ela é a resposta certa ensina onde
está a fronteira entre os dois ambientes.

---

## 2. O que a pilha local cria

Seis recursos, todos verificados na seção 5.

| Recurso | Papel no projeto |
| --- | --- |
| `AWS::S3::Bucket` | Onde as imagens ficariam. As colunas `foto_url` de `DestinoCatalogo` e `CatalogoAtividade` (`backend/prisma/schema.prisma`) hoje guardam URLs externas. |
| `AWS::SQS::Queue` (× 2) | Fila de notificações e sua DLQ. Os módulos `mail` e `notificacoes` hoje enviam dentro do request; com fila, uma falha de envio para de derrubar a resposta. |
| `AWS::SecretsManager::Secret` | O `JWT_SECRET`, **gerado** pelo CloudFormation. Veja a seção 3. |
| `AWS::SSM::Parameter` | `CORS_ORIGIN` — configuração não-secreta, separada do segredo de propósito. |
| `AWS::Logs::LogGroup` | Logs da API. |

**Parâmetros:** `Ambiente` (`local`/`dev`, prefixa os nomes) e
`RetencaoLogsDias`.

**Condição:** `EhDescartavel` liga o versionamento do bucket só fora de `local`.

> **Importante:** a API **não consome** nada disso hoje. O backend não tem
> nenhum SDK da AWS entre suas dependências (`backend/package.json`). Este
> modelo declara a infraestrutura de apoio da próxima etapa da arquitetura,
> validada antes de o código existir. Dizer o contrário numa apresentação seria
> teatro.

---

## 3. O segredo que o modelo gera, em vez de receber

A seção 7 do [`fluxo.md`](fluxo.md) registra uma limitação do modelo da AWS:

> O `JwtSecret` fica no user-data da instância, legível por quem tiver acesso à
> instância ou ao IMDS, apesar do `NoEcho`. `NoEcho` protege a API do
> CloudFormation, não a instância.

O `SegredoJwt` deste modelo é a correção. Com `GenerateSecretString`, o
CloudFormation **cria** o valor na hora da criação da pilha: ele nunca existe em
texto no modelo, nem no comando que cria a pilha, nem no histórico do shell de
quem a criou. Verificado: 48 caracteres, legíveis apenas por
`secretsmanager get-secret-value`.

É o melhor momento da demonstração para falar de segredos, porque dá para
mostrar os dois modelos lado a lado — o que recebe o segredo pronto e o que o
fabrica.

> O MiniStack 1.5.22 **ignora o `ExcludePunctuation: true`** e gera o valor com
> pontuação mesmo assim (medido na seção 5). Quem passar o segredo por um shell
> precisa de aspas.

---

## 4. Como rodar

Só precisa de Docker. **Nada de AWS CLI instalada e nenhuma credencial**: o
serviço `aws` do [`ministack/compose.yml`](ministack/compose.yml) está num
profile e já sai apontado para o emulador.

```bash
cd infra/ministack
docker compose up -d                 # sobe o MiniStack (espera ficar healthy)
```

> **No PowerShell, troque a quebra de linha.** Os blocos abaixo usam `\` ao fim
> da linha, que é sintaxe de shell POSIX; no PowerShell isso é erro de parser.
> Use o acento grave (`` ` ``) no lugar, ou cole cada comando numa única linha.
> O resto funciona igual — verificado: vírgula em `ParameterKey=…,ParameterValue=…`
> e colchetes em `--query` passam sem aspas extras.

Daqui em diante, todo comando é `docker compose run --rm aws <subcomando>`:

```bash
# criar
docker compose run --rm aws cloudformation create-stack \
  --stack-name viajajunto-local \
  --template-body file:///infra/viajajunto-local.yaml

# acompanhar
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local --query 'Stacks[0].StackStatus' --output text

# as saídas
docker compose run --rm aws cloudformation describe-stacks \
  --stack-name viajajunto-local \
  --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text
```

Provar que os recursos são reais, e não devolvidos de mentira:

```bash
# grava e lê no bucket
docker compose run --rm aws s3api put-object --bucket viajajunto-local-midia \
  --key fotos/gramado.jpg --body /infra/viajajunto-local.yaml
docker compose run --rm aws s3api list-objects-v2 --bucket viajajunto-local-midia \
  --query 'Contents[].[Key,Size]' --output text

# envia e recebe na fila (get-queue-url evita decorar o endereço)
docker compose run --rm aws sqs get-queue-url \
  --queue-name viajajunto-local-notificacoes --query QueueUrl --output text

docker compose run --rm aws sqs send-message --message-body 'convite:viagem=42' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes
docker compose run --rm aws sqs receive-message --output text --query 'Messages[0].Body' \
  --queue-url http://ministack:4566/000000000000/viajajunto-local-notificacoes

# o segredo que o CloudFormation gerou
docker compose run --rm aws secretsmanager get-secret-value \
  --secret-id viajajunto/local/jwt --query SecretString --output text
```

> A URL da fila tem **duas formas**: de dentro da rede do Compose o host é
> `ministack`, e a saída `UrlFilaNotificacoes` da pilha traz `localhost` — que é
> a forma válida para quem chama de fora do Docker. Use a de `ministack` nos
> comandos acima, porque eles rodam dentro da rede.

### A condição, pelos dois lados

Vale mostrar que a `Condition` é avaliada de verdade, criando uma segunda pilha:

```bash
docker compose run --rm aws cloudformation create-stack --stack-name viajajunto-dev \
  --template-body file:///infra/viajajunto-local.yaml \
  --parameters ParameterKey=Ambiente,ParameterValue=dev

docker compose run --rm aws s3api get-bucket-versioning --bucket viajajunto-dev-midia
```

Em `dev` a resposta é `{"Status": "Enabled"}`; em `local` ela vem vazia, que é
como a AWS representa um bucket nunca versionado.

### O change set

```bash
docker compose run --rm aws cloudformation create-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --use-previous-template \
  --parameters ParameterKey=RetencaoLogsDias,ParameterValue=30

docker compose run --rm aws cloudformation describe-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao \
  --query 'Changes[].ResourceChange.[LogicalResourceId,Action,Replacement]' --output text
```

Saída, verificada:

```
GrupoLogsApi	Modify	Conditional
```

O ponto a mostrar é o **isolamento**: dos seis recursos da pilha, o
CloudFormation aponta exatamente um. E dá para fechar o ciclo provando que o
update chega ao recurso:

```bash
docker compose run --rm aws cloudformation execute-change-set \
  --stack-name viajajunto-local --change-set-name muda-retencao

docker compose run --rm aws logs describe-log-groups \
  --log-group-name-prefix /viajajunto/local --output json
```

A retenção sai de `7` e vira `30` no recurso — não só no status da pilha.

### Encerrar

```bash
docker compose run --rm aws cloudformation delete-stack --stack-name viajajunto-local
docker compose down                 # o estado do emulador é em memória
```

---

## 5. Como isso foi verificado

| O que | Resultado |
| --- | --- |
| `viajajunto-demo.yaml` (EC2) | **Recusado** com `Unrecognized resource types: [AWS::EC2::Instance]`; nenhuma pilha criada |
| Parâmetro SSM público da AMI | **Não existe** no emulador, e ele diz isso em vez de inventar uma AMI |
| Criação da pilha local | `CREATE_COMPLETE`, seis saídas preenchidas |
| `Condition EhDescartavel` | `Ambiente=dev` → versionamento `Enabled`; `Ambiente=local` → resposta vazia. A condição é avaliada dos dois lados |
| `GetAtt` da DLQ no `RedrivePolicy` | ARN resolvido corretamente; `VisibilityTimeout: 60` aplicado |
| S3 usável | `put-object` → ETag; `list-objects-v2` → o objeto, com o tamanho exato do arquivo enviado |
| SQS usável | `send-message` → MessageId; `receive-message` → o corpo exato enviado |
| Secrets Manager usável | `GenerateSecretString` produziu 48 caracteres, lidos de volta |
| SSM usável | Parâmetro lido de volta: `http://localhost:3001` |
| `RetentionInDays` | Aplicado ao recurso: `retentionInDays: 7` |
| Change set | Isolou `GrupoLogsApi · Modify · Conditional`, sem tocar nos outros cinco |
| `--use-previous-template` | **Funciona** |
| `execute-change-set` | `UPDATE_COMPLETE`, e a retenção virou `30` **no recurso** |
| `delete-stack` | Pilha e todos os seis recursos somem, inclusive o bucket com objeto dentro |

Achados que mudaram o modelo ou esta documentação:

- **`ExcludePunctuation: true` é ignorado.** O segredo de 48 caracteres veio com
  `" # $ % ' + , - ; < ] { ~`. A propriedade ficou no modelo porque é correta
  para a AWS, com um comentário avisando da divergência.
- **`!Ref` num `AWS::SecretsManager::Secret` diverge entre ambientes.** O
  MiniStack devolve o **nome** (`viajajunto/local/jwt`); a AWS real devolve o
  ARN. A saída foi renomeada de `ArnSegredoJwt` para `ReferenciaSegredoJwt`,
  porque nenhum dos dois nomes específicos estaria certo nos dois lugares.
- **`Replacement` vem como `Conditional`,** não `False`. Na AWS real
  `RetentionInDays` é *"No interruption"*, o que daria `False`. Não muda o valor
  da demonstração — o recurso continua sendo o único apontado — mas não vale
  afirmar que a tela mostrará `False`.

---

## 6. Limitações — o que o MiniStack não prova

Vale o mesmo princípio da seção 7 do [`fluxo.md`](fluxo.md): saber o que o
ambiente **não** demonstra é parte de usá-lo com honestidade.

- **Não prova que o modelo funciona na AWS.** Prova que o CloudFormation aceita
  o modelo e que o emulador cria os recursos. Cotas, IAM, limites de serviço e
  divergências de comportamento ficam todas de fora — três delas estão medidas
  na seção 5.
- **Nada de EC2, `UserData` ou `CreationPolicy`** (seção 1). Para isso, a AWS
  real e o [`demo.md`](demo.md).
- **A API não consome esses recursos** (seção 2).
- **O estado é em memória.** Derrubar o contêiner apaga tudo. Para uma
  demonstração isso é vantagem — o reset é instantâneo e repetível — mas não
  conte com a pilha sobrevivendo a um `down`.
- **A versão está fixada em 1.5.22** no compose, de propósito: uma demonstração
  não deve mudar de comportamento porque saiu release novo na véspera. O preço é
  não receber correções sem alguém subir a tag.
