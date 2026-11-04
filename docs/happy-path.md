# Happy path: testando a API de ponta a ponta

Roteiro para validar o ViajaJunto inteiro numa máquina limpa, na ordem em que
uma pessoa usaria o produto: cadastro, viagem compartilhada, roteiro com foto,
orçamento, notificações, avaliação, descoberta e recuperação de senha.

Cada passo traz o comando, o que esperar e o requisito que ele exercita. Os
comandos são `curl` em bash (Linux, macOS ou Git Bash no Windows) e extraem os
valores com `sed`, sem depender de outras ferramentas. Tudo também pode ser feito
clicando no Swagger.

## 0. Subir o ambiente

Pré-requisito: Docker com Compose v2. Na raiz do repositório:

```bash
docker compose up -d --build --wait
docker compose ps
```

**Esperado:** `postgres`, `ministack`, `api` e `worker` como `healthy`;
`provisionar` e `migrar` como `Exited (0)`. O comando só devolve o terminal com
tudo pronto.

> Porta ocupada? Crie um `.env` na raiz com `API_PORT=3300`, `POSTGRES_PORT=55432`
> ou `MINISTACK_PORT=4577` e ajuste as variáveis abaixo.

Variáveis usadas no roteiro (cole no terminal):

```bash
API=http://localhost:3000/api/v1
MS=http://localhost:4566
SUFIXO=$(date +%s)            # e-mails novos a cada execucao
J='Content-Type: application/json'
# Le o primeiro campo com este nome no JSON (os aninhados vem depois)
campo() { grep -oE "\"$1\":\"?[^\",}]*" | head -1 | sed -E "s/^\"$1\":\"?//"; }
```

## 1. A API está de pé

```bash
curl -s http://localhost:3000/api/health/ready
```

**Esperado:** `{"status":"ok","banco":"ok",...}`. A documentação interativa fica em
<http://localhost:3000/api/docs>.

## 2. Duas contas *(RF01, RF02)*

```bash
ANA=$(curl -s -X POST $API/auth/registrar -H "$J" \
  -d "{\"nome\":\"Ana\",\"email\":\"ana.$SUFIXO@example.com\",\"senha\":\"senha12345\"}" | campo accessToken)
BRUNO_RESP=$(curl -s -X POST $API/auth/registrar -H "$J" \
  -d "{\"nome\":\"Bruno\",\"email\":\"bruno.$SUFIXO@example.com\",\"senha\":\"senha12345\"}")
BRUNO=$(echo "$BRUNO_RESP" | campo accessToken)
BRUNO_REFRESH=$(echo "$BRUNO_RESP" | campo refreshToken)
echo "$BRUNO_RESP"
```

**Esperado:** `201` com `tipoToken`, `accessToken` (15 min), `refreshToken` (30 dias)
e `usuario`. Nenhum campo de senha na resposta.

## 3. Ana cria a viagem *(RF04)*

```bash
VIAGEM_RESP=$(curl -s -X POST $API/viagens -H "$J" -H "Authorization: Bearer $ANA" \
  -d '{"nome":"Eurotrip","dataInicio":"2027-01-10","dataFim":"2027-01-25"}')
VIAGEM=$(echo "$VIAGEM_RESP" | campo id)
CONVITE=$(echo "$VIAGEM_RESP" | campo codigoConvite)
echo "$VIAGEM_RESP"
```

**Esperado:** `201`, `minhaPermissao: "CRIADOR"`, datas em `aaaa-mm-dd` e um
`codigoConvite` de 8 caracteres, diferente do `id`.

## 4. Bruno entra pelo convite *(RF18)*

```bash
curl -s $API/convites/$CONVITE -H "Authorization: Bearer $BRUNO"; echo
MEMBRO=$(curl -s -X POST $API/convites/$CONVITE/aceitar -H "Authorization: Bearer $BRUNO" | campo id)
```

**Esperado:** o primeiro comando mostra nome, datas e criador da viagem. O aceite
responde `201` com `permissao: "VISUALIZADOR"`.

## 5. Permissões *(RF19, RF20, RN02, RN03)*

```bash
# Visualizador nao edita
curl -s -X PATCH $API/viagens/$VIAGEM -H "$J" -H "Authorization: Bearer $BRUNO" -d '{"nome":"X"}'; echo
# Ana promove o Bruno a EDITOR
curl -s -X PATCH $API/viagens/$VIAGEM/membros/$MEMBRO -H "$J" -H "Authorization: Bearer $ANA" \
  -d '{"permissao":"EDITOR"}'; echo
```

**Esperado:** primeiro `403` com `"codigo":"SOMENTE_LEITURA"`; depois `200` com
`permissao: "EDITOR"`.

## 6. Foto enviada direto para o S3 *(RF09)*

A API só assina um formulário; o arquivo vai do cliente para o S3 (no MiniStack).

```bash
UP=$(curl -s -X POST $API/uploads -H "$J" -H "Authorization: Bearer $BRUNO" \
  -d '{"finalidade":"DESTINO","tipoConteudo":"image/png"}')
URL_S3=$(echo "$UP" | campo url); FOTO=$(echo "$UP" | campo urlPublica)
printf 'PNG-de-teste' > foto.png
curl -s -o /dev/null -w "S3 respondeu %{http_code}\n" "$URL_S3" \
  $(for c in key Content-Type bucket X-Amz-Algorithm X-Amz-Credential X-Amz-Date Policy X-Amz-Signature; do
      printf -- "-F %s=%s " "$c" "$(echo "$UP" | campo "$c")"; done) \
  -F file=@foto.png
curl -s "$FOTO"; echo
```

**Esperado:** `S3 respondeu 204` e o conteúdo do arquivo lido pela `urlPublica`.

## 7. Roteiro: destino e atividade *(RF08, RF09, RF12, RF13, RF16)*

```bash
DEST_CAT=$(curl -s -X POST $API/destinos -H "$J" -H "Authorization: Bearer $BRUNO" \
  -d "{\"nome\":\"Lisboa\",\"pais\":\"Portugal\",\"categoria\":\"CIDADE\",\"fotoUrl\":\"$FOTO\"}" | campo id)
DESTINO=$(curl -s -X POST $API/viagens/$VIAGEM/destinos -H "$J" -H "Authorization: Bearer $BRUNO" \
  -d "{\"destinoCatalogoId\":$DEST_CAT,\"chegada\":\"2027-01-10\",\"saida\":\"2027-01-15\"}" | campo id)
ATIV_CAT=$(curl -s -X POST $API/atividades -H "$J" -H "Authorization: Bearer $BRUNO" \
  -d '{"nome":"Torre de Belem","tipoAtividade":"PASSEIO","cidade":"Lisboa","pais":"Portugal"}' | campo id)
ATIV=$(curl -s -X POST $API/viagens/$VIAGEM/atividades -H "$J" -H "Authorization: Bearer $BRUNO" \
  -d "{\"destinoViagemId\":$DESTINO,\"catalogoAtividadeId\":$ATIV_CAT,\"dataHorario\":\"2027-01-11T14:30:00-03:00\",\"custoPrevisto\":120.5}" | campo id)
curl -s $API/viagens/$VIAGEM/atividades -H "Authorization: Bearer $ANA"; echo
```

**Esperado:** a lista traz a atividade com `custoPrevisto: "120.50"`,
`dataHorario` convertido para UTC (`2027-01-11T17:30:00.000Z`) e o destino com `ordem: 0`.

## 8. Orçamento *(RF15, RF16, RF17)*

```bash
curl -s -X PUT $API/viagens/$VIAGEM/orcamento -H "$J" -H "Authorization: Bearer $BRUNO" -d '{"valorTotal":5000}'; echo
curl -s $API/viagens/$VIAGEM/orcamento/resumo -H "Authorization: Bearer $ANA"; echo
```

**Esperado:** `previstoAtividades: "120.50"` e, no resumo, `saldoDisponivel: "4879.50"`,
`percentualConsumido: 2.41` e o gasto da categoria `PASSEIO`.

## 9. Notificações *(RF21)*

```bash
curl -s $API/notificacoes/contagem -H "Authorization: Bearer $ANA"; echo
curl -s "$API/notificacoes?apenasNaoLidas=true" -H "Authorization: Bearer $ANA"; echo
curl -s $API/notificacoes/contagem -H "Authorization: Bearer $BRUNO"; echo
```

**Esperado:** a Ana tem avisos do que o Bruno fez (`MEMBRO_ENTROU`, `DESTINO_ADICIONADO`,
`ATIVIDADE_ADICIONADA`, `ORCAMENTO_ATUALIZADO`...). O Bruno só tem o aviso da
promoção (`PERMISSAO_ALTERADA`): ninguém é notificado do que fez.

## 10. Concluir e avaliar *(RF07, RF22, RN05)*

```bash
curl -s -X PUT $API/atividades/$ATIV_CAT/avaliacoes/minha -H "$J" -H "Authorization: Bearer $ANA" -d '{"nota":5}'; echo
curl -s -X PATCH $API/viagens/$VIAGEM/atividades/$ATIV -H "$J" -H "Authorization: Bearer $ANA" -d '{"status":"CONCLUIDA"}' > /dev/null
curl -s -X PATCH $API/viagens/$VIAGEM -H "$J" -H "Authorization: Bearer $ANA" -d '{"status":"CONCLUIDA"}' > /dev/null
curl -s -X PUT $API/atividades/$ATIV_CAT/avaliacoes/minha -H "$J" -H "Authorization: Bearer $ANA" \
  -d '{"nota":5,"comentario":"Chegue cedo"}'; echo
```

**Esperado:** a primeira tentativa dá `403 ATIVIDADE_NAO_REALIZADA`; depois de concluir,
a avaliação é criada (`201`).

## 11. Descoberta e mapa *(RF11, RF23, RF24, RF25)*

```bash
curl -s "$API/atividades?cidade=Lisboa&notaMinima=4"; echo
curl -s $API/atividades/$ATIV_CAT; echo
curl -s $API/destinos/destaques; echo
curl -s $API/usuarios/eu/paises-visitados -H "Authorization: Bearer $ANA"; echo
```

**Esperado:** as rotas de catálogo respondem sem token; a Torre aparece com
`mediaAvaliacao: 5` e a avaliação recente; os destaques trazem destinos com média; o
mapa da Ana mostra `{"codigo":"PT","nome":"Portugal","viagens":1}`.

## 12. Recuperação de senha pelo e-mail *(RF03)*

O e-mail passa por API → fila SQS → worker → SES. No MiniStack o SES não envia de
verdade: guarda a mensagem para inspeção.

```bash
curl -s -X POST $API/auth/recuperar-senha -H "$J" -d "{\"email\":\"bruno.$SUFIXO@example.com\"}"; echo
sleep 3
CODIGO=$(curl -s $MS/_ministack/ses/messages | grep -o 'ViajaJunto: [0-9]\{6\}' | tail -1 | grep -o '[0-9]\{6\}')
TROCA=$(curl -s -X POST $API/auth/verificar-codigo -H "$J" \
  -d "{\"email\":\"bruno.$SUFIXO@example.com\",\"codigo\":\"$CODIGO\"}" | campo tokenTroca)
curl -s -X POST $API/auth/redefinir-senha -H "$J" \
  -d "{\"tokenTroca\":\"$TROCA\",\"novaSenha\":\"novaSenha123\",\"confirmarNovaSenha\":\"novaSenha123\"}"; echo
curl -s -o /dev/null -w "token antigo: %{http_code}\n" $API/usuarios/eu -H "Authorization: Bearer $BRUNO"
curl -s -o /dev/null -w "login com a senha nova: %{http_code}\n" -X POST $API/auth/login -H "$J" \
  -d "{\"email\":\"bruno.$SUFIXO@example.com\",\"senha\":\"novaSenha123\"}"
```

**Esperado:** `202` na etapa 1, `"Senha redefinida com sucesso"`, `token antigo: 401`
(a troca encerra as sessões) e `login com a senha nova: 200`. O e-mail pode ser lido
no navegador em <http://localhost:4566/_ministack/ses/messages>.

## 13. Sessão *(RF02)*

```bash
curl -s -o /dev/null -w "refresh antigo: %{http_code}\n" -X POST $API/auth/refresh -H "$J" \
  -d "{\"refreshToken\":\"$BRUNO_REFRESH\"}"
```

**Esperado:** `401` — a redefinição de senha apagou os refresh tokens do Bruno.

## 14. Erros no formato padrão

```bash
curl -s $API/viagens; echo                                   # sem token
curl -s $API/destinos/abc; echo                              # id invalido
curl -s -X POST $API/viagens -H "$J" -H "Authorization: Bearer $ANA" -d '{"nome":""}'; echo
```

**Esperado:** sempre `{ statusCode, codigo, mensagem, requestId, caminho, timestamp }`,
com `NAO_AUTENTICADO`, `ID_INVALIDO` e `VALIDACAO` (este com `detalhes` por campo).

## O mesmo roteiro, automatizado

As suítes de `backend/test/integracao/` percorrem estes fluxos (e os casos de erro)
contra Postgres e MiniStack reais, e rodam no CI a cada pull request:

```bash
docker compose up -d --wait postgres ministack && docker compose run --rm provisionar
docker compose exec postgres createdb -U viajajunto viajajunto_test
cd backend
export DATABASE_URL_TESTE="postgresql://viajajunto:viajajunto@localhost:5432/viajajunto_test?schema=public"
export MINISTACK_TESTE=http://localhost:4566
DATABASE_URL="$DATABASE_URL_TESTE" npx prisma migrate deploy
npm run test:integracao
```

> Pare o worker antes (`docker compose stop worker`): ele consumiria a fila de
> e-mails que a suíte de AWS verifica.

## Limpar

```bash
rm -f foto.png
docker compose down -v      # apaga banco, pilha do MiniStack e fotos
```
