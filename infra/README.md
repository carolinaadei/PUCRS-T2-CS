# Infraestrutura

## `viajajunto-demo.yaml` — ambiente de demonstração da API

O CI já publica a imagem do backend no Docker Hub, mas nenhum passo a sobe em
algum lugar. Este modelo de CloudFormation fecha essa ponta: cria o ambiente de
demonstração da API na AWS a partir da imagem publicada.

| Documento | Para quê |
| --- | --- |
| [`demo.md`](demo.md) | Passo a passo da apresentação: o que clicar, o que abrir e o que mostrar |
| [`fluxo.md`](fluxo.md) | Como a implementação funciona: a sequência de inicialização e as decisões por trás dela |

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
