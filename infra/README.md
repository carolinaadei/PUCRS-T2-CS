# Infraestrutura

Dois modelos de CloudFormation, com papéis distintos:

| Modelo | Onde roda | Papel |
| --- | --- | --- |
| [`viajajunto-demo.yaml`](viajajunto-demo.yaml) | AWS real | Sobe a API da imagem publicada pelo CI, numa EC2. O valor dele é a API respondendo. |
| [`viajajunto-local.yaml`](viajajunto-local.yaml) | MiniStack | Exercita o ciclo do CloudFormation sem conta, credencial ou custo. Detalhes em [`local.md`](local.md). |

O modelo da demonstração **não roda no MiniStack**: o emulador recusa o template
com `Unrecognized resource types: [AWS::EC2::Instance]` e não cria pilha nenhuma.
Isso é o comportamento desejado — ele cobre serviços gerenciados, não a máquina
virtual que você provisiona. O motivo e as medições estão na seção 1 do
[`local.md`](local.md).

---

## `viajajunto-demo.yaml` — ambiente de demonstração da API

O CI já publica a imagem do backend no Docker Hub, mas nenhum passo a sobe em
algum lugar. Este modelo de CloudFormation fecha essa ponta: cria o ambiente de
demonstração da API na AWS a partir da imagem publicada.

| Documento | Para quê |
| --- | --- |
| [`demo.md`](demo.md) | Passo a passo da apresentação: o que clicar, o que abrir e o que mostrar |
| [`fluxo.md`](fluxo.md) | Como a implementação funciona: a sequência de inicialização e as decisões por trás dela |
| [`local.md`](local.md) | O ambiente MiniStack: por que ele é um modelo separado, o que prova e o que não prova |

### O que a pilha cria

| Recurso | Papel |
| --- | --- |
| `AWS::EC2::Instance` | Na inicialização instala o Docker e sobe dois contêineres: o `postgres:16-alpine` (o mesmo do `backend/docker-compose.yml`) e a imagem `viajajunto-backend` do Docker Hub. |
| `AWS::EC2::SecurityGroup` | Libera a porta 3000. A 5432 não é publicada no host: o banco só é alcançado pela rede interna do Docker. |

**Parâmetros:** `ImagemBackend` e `TagImagem` (nome/tag da imagem),
`TipoInstancia`, `JwtSecret` e `AmiAmazonLinux`.

**Saídas:** a URL de `/api/docs` (Swagger) e a de `/api/health`.

A instância sobe na VPC padrão da conta — nenhum parâmetro de rede é pedido. Se a
conta não tiver VPC padrão, a criação falha.

A pilha leva **de 3 a 5 minutos** para ficar pronta: a maior parte é o
`docker pull` da imagem.

### Isto não é produção

O banco não tem volume nem backup, a senha do Postgres é fixa no script de
inicialização, o `JwtSecret` fica legível no user-data da instância e a porta
3000 fica aberta para a internet, sem TLS. O banco fica na mesma instância de
propósito: com Amazon RDS a criação da pilha demora vários minutos e atrapalha a
demonstração ao vivo. A lista completa de limitações está na seção 7 do
[`fluxo.md`](fluxo.md).

### Como verificar / depurar

O `CreationPolicy` da instância faz a pilha só chegar a `CREATE_COMPLETE` depois
que o `/api/health` responde — se a URL de saída aparecer, ela funciona. Quando
algo falha, a pilha vai a `CREATE_FAILED` em vez de esperar o timeout de 10
minutos, e o log completo da inicialização fica na instância, em
`/var/log/cloud-init-output.log`.

> O modelo não abre a porta 22 nem anexa perfil de IAM, então não há acesso por
> SSH ou Session Manager para ler esse log. Para depurar, adicione um
> `AWS::IAM::Role` com a política `AmazonSSMManagedInstanceCore` e um
> `AWS::IAM::InstanceProfile`.

A tabela de sintomas e causas comuns está no final do [`demo.md`](demo.md).

---

## `viajajunto-local.yaml` — ambiente MiniStack

Mesmo CloudFormation, outro alvo: um emulador local, sem conta na AWS, sem
credencial e sem custo. Serve para exercitar o ciclo completo — criar, prever
com change set, alterar, excluir — quantas vezes for preciso, inclusive offline.

### O que a pilha cria

| Recurso | Papel |
| --- | --- |
| `AWS::S3::Bucket` | Onde as imagens de destinos e atividades ficariam (as colunas `foto_url` do schema hoje guardam URLs externas). |
| `AWS::SQS::Queue` (× 2) | Fila de notificações e sua DLQ, ligadas por `RedrivePolicy`. |
| `AWS::SecretsManager::Secret` | O `JWT_SECRET`, **gerado** pelo CloudFormation em vez de recebido como parâmetro. |
| `AWS::SSM::Parameter` | `CORS_ORIGIN` — configuração não-secreta, separada do segredo. |
| `AWS::Logs::LogGroup` | Logs da API. |

Como rodar, o que cada passo prova e os achados das medições estão em
[`local.md`](local.md).

### O que ele não prova

Que o modelo funciona na AWS. Ele prova que o CloudFormation aceita o modelo e
que o emulador cria os recursos — cotas, IAM e diferenças de comportamento ficam
de fora. E a API **não consome** nada do que a pilha cria: o backend não tem
nenhum SDK da AWS entre suas dependências. É a infraestrutura da próxima etapa
da arquitetura, validada antes de o código existir.
