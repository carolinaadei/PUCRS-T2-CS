# RF03 — Recuperação de senha por e-mail

O fluxo tem **três etapas**, uma por tela do frontend: o usuário informa o e-mail,
recebe um **código de 6 dígitos**, confere o código e só então define a nova senha.
O e-mail leva apenas o código — não há link para clicar.

| # | Rota | Entrada | Saída |
| - | ---- | ------- | ----- |
| 1 | `POST /api/v1/auth/recuperar-senha` | `{ email }` | `202` com mensagem genérica |
| 2 | `POST /api/v1/auth/verificar-codigo` | `{ email, codigo }` | `{ tokenTroca, expiraEm }` |
| 3 | `POST /api/v1/auth/redefinir-senha` | `{ tokenTroca, novaSenha, confirmarNovaSenha }` | confirmação |

O `tokenTroca` da etapa 2 é uma credencial de vida curta (10 minutos) emitida
somente depois que o código confere. É ele que autoriza a etapa 3 — o código de
6 dígitos sozinho não troca senha nenhuma.

## Como o e-mail sai

```
API ──(etapa 1)──► fila SQS ──► worker ──► provedor (Brevo, SES ou log)
```

- Com `SQS_FILA_EMAILS` configurada (é o caso do `docker compose up`), a API só
  enfileira e responde. O worker (`node dist/worker`) entrega; se o provedor
  falhar, a mensagem volta para a fila e é tentada de novo. Na terceira falha ela
  vai para a DLQ `viajajunto-<ambiente>-emails-dlq`, em vez de sumir. Uma mensagem
  que nem é um e-mail completo é pulada (sem derrubar as outras do lote) e segue o
  mesmo caminho até a DLQ.
- Sem a fila (API rodando com `npm run start:dev`), o e-mail é entregue na hora.

O provedor é escolhido por `MAIL_PROVEDOR`:

| Valor | Para onde vai | Quando usar |
| ----- | ------------- | ----------- |
| `log` | terminal da API/worker | desenvolvimento (padrão fora do Docker) |
| `ses` | Amazon SES; no compose, o SES do MiniStack | padrão do `docker compose up` — os e-mails aparecem em `http://localhost:4566/_ministack/ses/messages` |
| `brevo` | [API transacional do Brevo](https://developers.brevo.com/reference/sendtransacemail) | envio real sem conta AWS |

Em produção só `ses` ou `brevo` são aceitos: a API não sobe com `log`.

## Variáveis

| Variável | O que é |
| -------- | ------- |
| `RECUPERACAO_CODIGO_SECRET` | Segredo do HMAC do código. Mínimo de 32 caracteres. No compose, gerado pela pilha CloudFormation no Secrets Manager |
| `MAIL_PROVEDOR` | `log`, `ses` ou `brevo` |
| `EMAIL_REMETENTE` / `EMAIL_REMETENTE_NOME` | Remetente. No Brevo, precisa estar validado no painel |
| `BREVO_API_KEY` | Chave da API v3 do Brevo (começa com `xkeysib-`), obrigatória com `MAIL_PROVEDOR=brevo` |
| `SQS_FILA_EMAILS` | URL da fila; sem ela, o envio é direto |

O segredo é o *pepper* do hash: o banco guarda só o HMAC do código, nunca o código
em si. Um código de 6 dígitos tem apenas 1.000.000 de valores possíveis, então um
SHA-256 sem segredo seria revertido por força bruta em segundos por quem tivesse
acesso ao banco. Com o HMAC, ler o banco não basta.

### Usando o Brevo

1. Crie a conta em [app.brevo.com](https://app.brevo.com) (o plano gratuito envia 300 e-mails por dia).
2. Cadastre e **valide** o remetente em *Senders*: enquanto o link de confirmação não
   for clicado, a API do Brevo recusa os envios.
3. Gere a chave em *Settings → API keys*.
4. No `.env`: `MAIL_PROVEDOR=brevo`, `BREVO_API_KEY=...`, `EMAIL_REMETENTE=<remetente validado>`.

## Testando

Pelo compose: chame a etapa 1 no Swagger (`http://localhost:3000/api/docs`) e abra
`http://localhost:4566/_ministack/ses/messages` — o código está no corpo do e-mail.

Com `MAIL_PROVEDOR=log`, o e-mail inteiro sai no terminal. Fora de produção o código
também aparece no `Logger.debug` da API.

## Regras que valem a pena conhecer

Elas existem porque um código de 6 dígitos é curto o suficiente para ser adivinhado:

- **Validade de 15 minutos**, e o código vale **uma única vez**.
- **Pedir um código novo invalida os anteriores** — só o último funciona.
- **5 tentativas queimam o código**, e aí nem o código certo funciona mais. Esta é a
  defesa principal contra força bruta, porque não depende do IP. A tentativa é
  reservada no banco **antes** de o código ser conferido, num `UPDATE` condicional,
  então nem uma rajada de requisições em paralelo passa do teto.
- **Rate limit por IP:** 3 pedidos a cada 15 minutos na etapa 1, 10 na etapa 2 e 5 na
  etapa 3. Estourar devolve `429 MUITAS_REQUISICOES`.
- **A resposta da etapa 1 é sempre a mesma**, exista o e-mail ou não, e chega no
  mesmo tempo: a API responde antes de gravar o código e de enfileirar o e-mail.
- **Falha no envio não vira erro para o cliente**: o código já está salvo e o worker
  tenta de novo.
- **O token de troca vale uma única vez**, mesmo com requisições simultâneas.
- **Redefinir a senha encerra todas as sessões**: os refresh tokens são apagados e os
  access tokens emitidos antes passam a receber `401 SESSAO_ENCERRADA`.

## Erros

| Código | Quando |
| ------ | ------ |
| `CODIGO_RECUPERACAO_INVALIDO` | código errado, expirado, já usado, queimado ou e-mail desconhecido (mensagem única de propósito) |
| `TOKEN_TROCA_INVALIDO` | token de troca inexistente, usado ou expirado |
| `SENHAS_DIVERGENTES` | `confirmarNovaSenha` diferente de `novaSenha` |
| `MUITAS_REQUISICOES` | rate limit estourado |

## Problemas comuns

**A API não sobe: `MAIL_PROVEDOR deve ser ses ou brevo em producao`** — em produção
o e-mail precisa de um provedor de verdade.

**`RECUPERACAO_CODIGO_SECRET ... ao menos 32 caracteres`** — gere com
`openssl rand -base64 48`.

**Etapa 1 responde 202 mas o e-mail não chega** — veja o log do worker
(`docker compose logs worker`). Com Brevo, quase sempre é remetente não validado; a
linha de falha traz a resposta do Brevo. Mensagens que falharam 3 vezes estão na DLQ.

**Etapa 2 devolve 400 com um código que você acabou de receber** — confira se é o
e-mail **mais recente**: pedir outro código invalida os pendentes.
