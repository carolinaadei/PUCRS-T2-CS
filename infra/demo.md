# Roteiro da demonstração — ambiente de demo da API

Como criar, mostrar e destruir a pilha do [`viajajunto-demo.yaml`](viajajunto-demo.yaml)
em cerca de 5 minutos de apresentação. O fluxo interno do modelo está em
[`fluxo.md`](fluxo.md).

---

## Antes da apresentação

Faça isto com antecedência — nada aqui rende demonstração ao vivo.

- [ ] **Conta AWS** com permissão para criar pilhas, instâncias EC2 e grupos de segurança.
- [ ] **Região com VPC padrão.** O modelo não pede parâmetro de rede: o grupo de
      segurança e a instância vão para a VPC padrão da conta. Confirme em
      **VPC → Your VPCs** que existe uma marcada como *Default VPC*. Sem ela, a
      criação falha.
- [ ] **Imagem publicada no Docker Hub.** É o que o job *Publicar no Docker Hub*
      do CI empurra a cada push na `main`. Confirme o nome exato do repositório
      (ex.: `seu-usuario/viajajunto-backend`) e que a tag `latest` existe.
- [ ] **Segredo do JWT** gerado e copiado: `openssl rand -base64 32`
- [ ] **Plano B:** crie uma pilha de reserva na véspera, com outro nome
      (`viajajunto-demo-reserva`), e deixe a aba aberta. Se a criação ao vivo
      falhar, você mostra o resultado nessa e segue a apresentação.

### Abas para deixar abertas

| Aba | Para quê |
| --- | --- |
| `infra/viajajunto-demo.yaml` no editor ou no GitHub | Passo 1 |
| Console do CloudFormation, na região escolhida | Passos 2, 3, 5 e 6 |
| Página da imagem no Docker Hub | Opcional, para ligar a demo ao CI |

As duas URLs de saída você abre no passo 4 — elas só existem depois de a pilha
ficar pronta.

---

## Passo 1 — Mostrar o modelo (~1 min)

Abra o `viajajunto-demo.yaml` e aponte, nesta ordem:

1. **`Parameters`** — nome e tag da imagem, tipo da instância e o `JwtSecret`
   (marcado com `NoEcho: true`, por isso aparece mascarado no console).
2. **`Resources`** — são só dois: a instância EC2 e o grupo de segurança que abre
   a porta 3000. A porta 5432 **não** é publicada: o banco só é alcançado pela
   rede interna do Docker.
3. **`UserData`** — os dois comentários que explicam as decisões: por que o
   contêiner sobe com `NODE_ENV=development` e por que as migrations rodam
   chamando o Prisma direto pelo `node`.
4. **`Outputs`** — as URLs do Swagger e do `/api/health`, montadas a partir do DNS
   público da instância.

> Frase útil aqui: *"o CI já publica a imagem, mas nada a executava em lugar
> nenhum; este modelo é o passo que faltava."*

---

## Passo 2 — Criar a pilha (~1 min de cliques)

No console: **CloudFormation → Create stack → With new resources (standard)**.

1. *Prepare template:* **Choose an existing template**
2. *Template source:* **Upload a template file → Choose file** → selecione
   `infra/viajajunto-demo.yaml` → **Next**
3. *Stack name:* `viajajunto-demo`
4. Preencha os parâmetros:

   | Parâmetro | Valor |
   | --- | --- |
   | `ImagemBackend` | `seu-usuario/viajajunto-backend` |
   | `TagImagem` | `latest` |
   | `TipoInstancia` | `t3.micro` |
   | `JwtSecret` | cole o segredo gerado (o campo vem mascarado) |
   | `AmiAmazonLinux` | deixe o padrão |

5. **Next → Next → Submit**. Não há nada para marcar em *Capabilities*: o modelo
   não cria recursos de IAM.

O `AmiAmazonLinux` é um parâmetro do tipo SSM: o CloudFormation resolve o caminho
`/aws/service/ami-amazon-linux-latest/...` para o ID da AMI mais recente **na
região da pilha**. Vale mencionar — é o que evita uma tabela de AMIs por região.

---

## Passo 3 — Acompanhar os eventos (3 a 5 min)

Fique na aba **Events** e narre o que aparece:

1. `GrupoSeguranca` → `CREATE_COMPLETE` (rápido).
2. `InstanciaDemo` → `CREATE_IN_PROGRESS`, com *"Resource creation Initiated"*.
3. A instância fica **vários minutos** nesse estado. É aqui que está o conteúdo
   da apresentação: a instância já existe, mas o CloudFormation está
   **esperando um sinal** dela.

O que explicar durante a espera: o `CreationPolicy` da instância faz a pilha só
chegar a `CREATE_COMPLETE` depois que a própria instância confirma, via
`cfn-signal`, que o `/api/health` respondeu. Sem isso a pilha ficaria pronta em
segundos — antes de o Docker terminar de instalar — e a URL daria *connection
refused* na hora de abrir.

A maior parte do tempo é o `docker pull` da imagem. Nesse intervalo dá para abrir
a aba **Resources** e mostrar os dois recursos com os IDs reais já atribuídos.

Quando a pilha chegar a `CREATE_COMPLETE`, a API **já está no ar** — é exatamente
o que o sinal significa.

---

## Passo 4 — Mostrar que funciona

Vá na aba **Outputs**. Há dois links.

### `UrlHealth` → `http://<dns-publico>:3000/api/health`

Abra primeiro. A resposta é:

```json
{ "status": "ok", "banco": "ok", "timestamp": "2026-10-05T21:24:56.273Z" }
```

**Aponte o `"banco": "ok"`.** É a prova de duas coisas de uma vez: o Postgres está
no ar e as migrations foram aplicadas. Se o banco estivesse fora, este mesmo
endpoint responderia `"status": "degradado"` — e continuaria devolvendo 200.

### `UrlSwagger` → `http://<dns-publico>:3000/api/docs`

A página do Swagger UI carrega com o contrato completo. Role pelas seções
(Autenticação, Viagens, Orçamento, Colaboração…) para mostrar que é a API
inteira, não um *hello world*.

> **Cuidado:** o botão **Try it out** não funciona direto. O campo `servers` do
> documento OpenAPI está fixo em `http://localhost:3000`
> (`backend/src/config/swagger.ts`), então o botão aponta para a máquina de quem
> abriu o navegador, não para a instância. Se quiser executar uma chamada ao
> vivo, troque o servidor no seletor no topo da página antes. O roteiro acima não
> depende disso.

---

## Passo 5 — Change set: a prévia sem executar

Este é o passo que mostra o valor do CloudFormation além de "criar coisas".

1. Com a pilha selecionada: **Stack actions → Create change set for current stack**
2. *Prepare template:* **Use current template → Next**
3. Troque `TipoInstancia` de `t3.micro` para `t3.small` → **Next → Next →
   Create change set**
4. Dê um nome (`troca-tipo-instancia`) e confirme.

Quando o change set terminar de calcular, abra a aba **Changes** e aponte a coluna
**Replacement**:

| Logical ID | Action | Replacement |
| --- | --- | --- |
| `InstanciaDemo` | `Modify` | **`True`** |

`Replacement: True` significa que a instância seria **destruída e recriada** —
trocar o tipo não é uma alteração no lugar. A frase a dizer é essa: *"o
CloudFormation me diz o que vai acontecer antes de eu deixar acontecer."*

**Não execute.** Saia da tela ou use **Delete change set**. A pilha fica intacta,
ainda no ar.

---

## Passo 6 — Excluir a pilha

**Delete → Delete stack** e volte para a aba **Events**.

Narre a ordem inversa: a instância sai primeiro, o grupo de segurança depois —
ele não pode ser removido enquanto a instância o usa. A pilha chega a
`DELETE_COMPLETE` e desaparece da lista.

Para fechar: o banco vivia dentro do contêiner, sem volume, então os dados vão
junto. É o comportamento desejado num ambiente de demonstração, e é exatamente o
que o torna inadequado para qualquer outra coisa.

> **Confirme que a pilha foi excluída de verdade.** Uma `t3.micro` esquecida
> continua sendo cobrada.

---

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `CREATE_FAILED` com *"Received FAILURE signal"* | Um passo da inicialização falhou — o mais comum é nome ou tag de imagem errados, e o `docker pull` não acha nada | Confira `ImagemBackend` e `TagImagem` na aba **Parameters** |
| `CREATE_FAILED` logo no início, sem sinal nenhum | A conta não tem VPC padrão na região | Troque de região ou crie a VPC padrão |
| Fica em `CREATE_IN_PROGRESS` por 10 min e falha por timeout | O `cfn-signal` nunca chegou | Em geral é saída de internet: a instância precisa alcançar o Docker Hub **e** o `binaries.prisma.sh` (veja [`fluxo.md`](fluxo.md)) |
| O Swagger carrega mas `"banco"` vem `"indisponivel"` | O contêiner do Postgres caiu depois das migrations | Recrie a pilha |

O log completo da inicialização fica na instância, em
`/var/log/cloud-init-output.log` — mas **o modelo não abre a porta 22 nem anexa
perfil de IAM**, então não há SSH nem Session Manager para ler esse log. Se você
precisa depurar, veja a seção *Como verificar / depurar* do [`README.md`](README.md).

Pior ainda: quando a criação falha, o CloudFormation faz rollback e remove a
instância, apagando o log junto. Para investigar, desmarque **"Rollback on
failure"** nas opções avançadas **antes** de criar a pilha.

---

## Custo

Uma `t3.micro` mais o tráfego de saída, pelos minutos em que a pilha existir —
centavos. O risco não é o preço da demo, é esquecer a pilha no ar. Exclua no
passo 6.
