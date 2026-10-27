# RF03 — Recuperação de senha por e-mail

Guia para deixar o envio do e-mail de recuperação funcionando na sua máquina.

O fluxo tem **três etapas**, uma por tela do frontend: o usuário informa o e-mail,
recebe um **código de 6 dígitos**, confere o código e só então define a nova senha.
O e-mail leva apenas o código — não há link para clicar.

| # | Rota | Entrada | Saída |
| - | ---- | ------- | ----- |
| 1 | `POST /api/auth/recuperar-senha` | `{ email }` | mensagem genérica |
| 2 | `POST /api/auth/verificar-codigo` | `{ email, codigo }` | `{ tokenTroca, expiraEm }` |
| 3 | `POST /api/auth/redefinir-senha` | `{ tokenTroca, novaSenha, confirmarNovaSenha }` | confirmação |

O `tokenTroca` da etapa 2 é uma credencial de vida curta (10 minutos) emitida
somente depois que o código confere. É ele que autoriza a etapa 3 — o código de
6 dígitos sozinho não troca senha nenhuma.

## Variáveis de ambiente

Em produção, `JWT_SECRET`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` e
`RECUPERACAO_CODIGO_SECRET` são obrigatórias; `BREVO_SENDER_NOME` é opcional.
A aplicação falha no boot quando uma variável obrigatória está faltando.

| Variável | O que é |
| -------- | ------- |
| `JWT_SECRET` | Segredo usado para assinar os tokens JWT |
| `BREVO_API_KEY` | Chave da API v3 do Brevo, começa com `xkeysib-` |
| `BREVO_SENDER_EMAIL` | Remetente, **já validado** no painel do Brevo |
| `BREVO_SENDER_NOME` | Nome opcional que aparece como remetente (ex.: `ViajaJunto`) |
| `RECUPERACAO_CODIGO_SECRET` | Segredo do HMAC do código. Mínimo de 32 caracteres |

Gere o segredo com:

```bash
openssl rand -base64 48
```

Ele é o *pepper* do hash: o banco guarda só o HMAC do código, nunca o código em
si. Um código de 6 dígitos tem apenas 1.000.000 de valores possíveis, então um
SHA-256 sem segredo seria revertido por força bruta em segundos por quem tivesse
acesso ao banco. Com o HMAC, ler o banco não basta.

> Cada desenvolvedor gera o seu. O valor não precisa ser igual entre máquinas —
> só não pode mudar enquanto houver códigos pendentes, senão eles param de conferir.

## Configurando o Brevo

Usamos a [API transacional do Brevo](https://developers.brevo.com/reference/sendtransacemail),
chamada direto com `fetch`, sem SDK. O plano gratuito envia **300 e-mails por dia**,
mais que suficiente para desenvolvimento.

1. **Crie a conta** em [app.brevo.com](https://app.brevo.com).

2. **Cadastre e valide o remetente** em
   [app.brevo.com/senders/list](https://app.brevo.com/senders/list) → *Add a sender*.
   O Brevo envia um e-mail de confirmação: **enquanto você não clicar no link, a API
   recusa os envios.** Um Gmail pessoal serve; não é preciso ter domínio próprio.

3. **Gere a chave de API** em
   [app.brevo.com/settings/keys/api](https://app.brevo.com/settings/keys/api) →
   *Generate a new API key*.

4. **Preencha o `.env`** com os três valores do Brevo mais o `RECUPERACAO_CODIGO_SECRET`.

## Testando

Suba o banco e a API:

```bash
npm run db:up
npm run start:dev
```

Depois use o Swagger em `http://localhost:3000/api/docs`, chamando as três rotas
na ordem e copiando o `tokenTroca` da etapa 2 para a etapa 3.

**Sem esperar o e-mail chegar:** o código também é escrito no terminal da API,
pelo `Logger.debug`:

```
DEBUG [AuthService] Codigo de recuperacao para alguem@exemplo.com: 418239
```

É um atalho de desenvolvimento. Em produção o nível `debug` fica desligado, então
a linha não é emitida.

## Regras que valem a pena conhecer

Elas existem porque um código de 6 dígitos é curto o suficiente para ser adivinhado:

- **Validade de 15 minutos**, e o código vale **uma única vez**.
- **Pedir um código novo invalida os anteriores** — só o último funciona.
- **5 tentativas queimam o código**, e aí nem o código certo funciona mais: é
  preciso pedir outro. Esta é a defesa principal contra força bruta, porque não
  depende do IP de quem tenta. A tentativa é reservada no banco **antes** de o
  código ser conferido, num `UPDATE` condicional, então nem uma rajada de
  requisições em paralelo passa do teto.
- **Rate limit de 3 pedidos a cada 15 minutos** por IP na etapa 1, 10 na etapa 2 e
  5 na etapa 3. Estourar devolve **429**. O contador fica em memória: reiniciar a
  API zera.
- **A resposta da etapa 1 é sempre a mesma**, exista o e-mail ou não, e chega no
  mesmo tempo: a API responde antes de gravar o código e de chamar o Brevo. Se
  esperasse, um e-mail cadastrado demoraria centenas de ms a mais, e daria para
  descobrir quem tem conta no ViajaJunto só medindo o tempo de resposta.
- **Falha no envio do e-mail não vira erro para o cliente**: é registrada no log e a
  resposta continua sendo 200. O código já está salvo e permanece válido.
- **O token de troca vale uma única vez**, mesmo com requisições simultâneas: ele é
  consumido no mesmo `UPDATE` que confere se ainda está livre.
- **Redefinir a senha encerra todas as sessões**: os JWTs emitidos antes da troca
  passam a receber 401, inclusive um token que tenha sido roubado. Cada usuário tem
  uma versão de sessão, que vai no JWT e é incrementada na troca.

## Problemas comuns

**A API não sobe: `Configuracao de ambiente invalida: BREVO_API_KEY e obrigatoria`**
— falta preencher o `.env`. Copie de `.env.example` e complete as quatro variáveis
desta página.

**`RECUPERACAO_CODIGO_SECRET deve ter ao menos 32 caracteres`** — o campo ficou
vazio ou curto demais. Gere com `openssl rand -base64 48`.

**A API responde 200 mas o e-mail não chega** — é quase sempre remetente não
validado. Procure no log a linha `Falha ao enviar e-mail de recuperacao`, que traz
a resposta do Brevo. Confira também a caixa de spam e os *Logs* em
[app.brevo.com](https://app.brevo.com), que mostram entregas e bounces.

**Etapa 2 devolve 400 com um código que você acabou de receber** — verifique se é
mesmo o e-mail **mais recente**: pedir um código novo invalida os pendentes. Se
você errou o código 5 vezes antes, ele foi queimado; peça outro.

**401 `Sessao encerrada; faca login novamente` depois de redefinir a senha** —
esperado: a troca revoga os tokens anteriores. Faça login com a senha nova.

**429 em tudo durante os testes** — você estourou o rate limit. Reinicie a API
para zerar o contador, ou espere 15 minutos.
