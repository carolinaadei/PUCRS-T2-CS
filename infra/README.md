# Infraestrutura

## `viajajunto-demo.yaml` — ambiente de demonstração da API

O CI já publica a imagem do backend no Docker Hub, mas nenhum passo a sobe em
algum lugar. Este modelo de CloudFormation fecha essa ponta: cria o ambiente de
demonstração da API na AWS a partir da imagem publicada.

### O que a pilha cria

| Recurso | Papel |
| --- | --- |
| `AWS::EC2::Instance` | Na inicialização instala o Docker e sobe dois contêineres: o `postgres:16-alpine` (o mesmo do `docker-compose.yml`) e a imagem `viajajunto-backend` do Docker Hub. |
| `AWS::EC2::SecurityGroup` | Libera a porta 3000. A 5432 não é publicada no host: o banco só é alcançado pela rede interna do Docker. |

**Parâmetros:** `ImagemBackend` e `TagImagem` (nome/tag da imagem),
`TipoInstancia` e `JwtSecret`.

**Saídas:** a URL de `/api/docs` (Swagger) e a de `/api/health`.

A instância sobe na VPC padrão da conta — nenhum parâmetro de rede é pedido. Se
a conta não tiver VPC padrão, a criação falha.

### Roteiro da demonstração (~5 minutos)

1. Mostrar o modelo e criar a pilha pelo console (**CloudFormation → Create
   stack → Upload a template file**), preenchendo os parâmetros.
2. Acompanhar os eventos até `CREATE_COMPLETE` e abrir as URLs da aba
   **Outputs**: o `/api/health` responde `{"status":"ok","banco":"ok"}` e o
   Swagger carrega.
3. Alterar um parâmetro (o `TipoInstancia`, por exemplo) e gerar um **change
   set** para mostrar a prévia — sem executar. O console mostra que a instância
   seria substituída.
4. Excluir a pilha e mostrar que a instância e o grupo de segurança somem
   juntos. O banco vive dentro do contêiner, então os dados vão com ele.

A pilha leva **de 3 a 5 minutos** para ficar pronta: a maior parte é o
`docker pull` da imagem. Vale criá-la um pouco antes da apresentação.

### Duas decisões que o código impôs

**`NODE_ENV=development`.** A imagem roda com `NODE_ENV=production`, e nesse modo
a validação de ambiente (`backend/src/config/validacao-env.ts`) exige
`JWT_SECRET`, `RECUPERACAO_CODIGO_SECRET` e as chaves do Brevo — sem elas a API
não sobe. Cadastrar um remetente de e-mail não faz sentido para uma demo, então
o contêiner inicia em `development`, onde essas variáveis caem num padrão e a API
apenas avisa no log. O `JWT_SECRET` continua vindo do parâmetro, para os tokens
não serem assinados com o segredo de desenvolvimento.

**Migrations antes da API.** O banco nasce vazio, então o script de inicialização
roda `prisma migrate deploy` num contêiner efêmero da própria imagem (ela carrega
o `schema.prisma` e a pasta `prisma/migrations` justamente para isso) antes de
subir a API. O runtime não tem `npm` nem `npx` — o `Dockerfile` os remove —, por
isso o comando chama o CLI do Prisma direto pelo `node`:

```sh
node node_modules/prisma/build/index.js migrate deploy
```

### Por que o banco fica na mesma instância

Com Amazon RDS a criação da pilha demora vários minutos e atrapalha a demo ao
vivo. Isso torna o modelo inadequado para qualquer coisa além da demonstração:
o banco não tem volume nem backup, a senha do Postgres é fixa no script de
inicialização e a porta 3000 fica aberta para a internet, sem TLS.

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

### Limitação conhecida do Swagger

O `servers` do documento OpenAPI está fixo em `http://localhost:3000`
(`backend/src/config/swagger.ts`), então o botão **Try it out** da página aponta
para a máquina de quem abre o navegador, não para a instância. A página carrega e
o contrato aparece — o que o roteiro pede —, mas para executar uma chamada é
preciso trocar o servidor no seletor da própria página.
