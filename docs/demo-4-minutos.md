# Demo pelo Swagger em 4 minutos

Roteiro para gravar a demonstração do ViajaJunto sem narração: cada etapa é uma
chamada real feita no Swagger, e a própria resposta na tela explica o que
aconteceu. São 12 etapas, com os mesmos tempos e dados do ensaio automatizado
em `backend/scripts/demo.mjs`.

## Antes de gravar

1. Preencha `GEOAPIFY_API_KEY` no `backend/.env` (veja o [guia da Geoapify](geoapify.md)).
   Sem a chave, as etapas 5 e 6 respondem `503 GEOAPIFY_INDISPONIVEL`.
2. Na raiz do repositório, suba tudo:

    ```bash
    docker compose --env-file backend/.env up -d --build --wait
    ```

    O `worker` precisa estar `healthy`: é ele que entrega o e-mail da etapa 11.

3. Ensaie o fluxo inteiro no terminal. Cada ENTER executa uma etapa e mostra o
   tempo dela no vídeo; `--automatico` roda sem pausas e `--limpar` apaga, no fim,
   só os dados que aquela execução criou:

    ```bash
    cd backend
    npm run demo -- --automatico --limpar
    ```

    **Esperado:** termina com `"resultado": "Fluxo concluido com sucesso"`. Se
    alguma etapa falhar aqui, ela vai falhar também na gravação.

4. Abra o Swagger em <http://localhost:3000/api/docs> (troque `3000` pelo
   `API_PORT` do `.env`, se tiver mudado). O token informado em **Authorize**
   continua valendo depois de recarregar a página.

Dicas para a gravação:

- A demo usa duas contas, Ana e Bruno. Deixe um bloco de notas ao lado para
  colar os dois `accessToken` e os ids que aparecem nas respostas. Trocar de
  conta é **Authorize → Logout**, colar o outro token e **Authorize**.
- Use e-mails novos a cada gravação (`ana.demo.2@example.com`, `...3`, ...);
  repetir um e-mail devolve `409`.
- Feche as seções do Swagger que não vão aparecer, para a rolagem ficar curta.

## Roteiro

A coluna **Conta** diz qual token deve estar no **Authorize** na hora da
chamada. Rotas marcadas com "—" são públicas.

### 01. Ambiente e saúde · 0:00–0:10

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| — | Health | `GET /api/health/ready` | `200`, `"status": "ok"` |

### 02. Cadastro, login e painel pessoal · 0:10–0:30

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| — | Autenticacao | `POST /auth/registrar` com Ana | `201` com `accessToken` e `refreshToken` |
| — | Autenticacao | `POST /auth/registrar` com Bruno | `201`; guarde o `accessToken` de Bruno |
| — | Autenticacao | `POST /auth/login` com Ana | `200`; guarde o `accessToken` de Ana |
| Ana | Viagens | `GET /viagens` | `200` com a lista vazia |

```json
{ "nome": "Ana Demo", "email": "ana.demo.1@example.com", "senha": "senha12345" }
```

```json
{ "nome": "Bruno Demo", "email": "bruno.demo.1@example.com", "senha": "senha12345" }
```

### 03. Criar viagem · 0:30–0:45

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Ana | Viagens | `POST /viagens` | `201`; guarde o `id` e o `codigoConvite` |
| Ana | Viagens | `GET /viagens` | a viagem nova é o primeiro item |

```json
{ "nome": "Porto com amigos", "dataInicio": "2027-01-10", "dataFim": "2027-01-15" }
```

### 04. Convite e permissões · 0:45–1:15

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Bruno | Viagens | `GET /viagens/{id}` | `404`: quem não é membro nem sabe que a viagem existe |
| Bruno | Colaboracao | `GET /convites/{codigo}` | `200` com o resumo da viagem |
| Bruno | Colaboracao | `POST /convites/{codigo}/aceitar` | `201`, `"permissao": "VISUALIZADOR"`; guarde o `id` do membro |
| Bruno | Viagens | `PATCH /viagens/{id}` com `{ "nome": "Tentativa de edicao" }` | `403`: visualizador não edita |
| Ana | Colaboracao | `PATCH /viagens/{id}/membros/{membroId}` com `{ "permissao": "EDITOR" }` | `200`, `"permissao": "EDITOR"` |

### 05. Geoapify: cidade e importação sem duplicar · 1:15–1:40

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Ana | Lugares - Geoapify | `GET /lugares/cidades?busca=Porto&pais=pt&limite=1` | `200` com o `idExterno` da cidade |
| Ana | Lugares - Geoapify | `GET /lugares/cidades?busca=Por&pais=pt&autocompletar=true&limite=1` | `200` com a sugestão |
| Ana | Lugares - Geoapify | `POST /lugares/destinos/importar` com `{ "idExterno": "..." }` | `201`; guarde `id`, `latitude` e `longitude` |
| Ana | Lugares - Geoapify | repita o mesmo `POST` | `201` com o **mesmo `id`**: importar de novo não duplica |

Na resposta da importação, mostre `fonte` e `atribuicoes`: a origem do dado vai
junto com ele.

### 06. Geoapify: lugar e roteiro · 1:40–2:05

Bruno agora é editor, então é ele quem monta o roteiro.

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Bruno | Destinos - Viagem | `POST /viagens/{id}/destinos` | `201`; guarde o `id` do destino da viagem |
| Bruno | Lugares - Geoapify | `GET /lugares/atividades?latitude=...&longitude=...&tipoAtividade=PASSEIO&limite=5` | `200` com lugares perto da cidade |
| Bruno | Lugares - Geoapify | `POST /lugares/atividades/importar` com o `idExterno` do primeiro lugar | `201`; guarde o `id` do lugar |
| Bruno | Atividades - Viagem | `POST /viagens/{id}/atividades` | `201`; guarde o `id` da atividade |
| Ana | Atividades - Viagem | `GET /viagens/{id}/atividades` | o roteiro tem a atividade, com `"fonte": "geoapify"` |

```json
{ "destinoCatalogoId": 1, "chegada": "2027-01-10", "saida": "2027-01-15" }
```

```json
{
  "destinoViagemId": 1,
  "catalogoAtividadeId": 1,
  "dataHorario": "2027-01-11T14:30:00-03:00",
  "custoPrevisto": 120.5
}
```

Troque os `1` pelos ids guardados nas etapas anteriores.

### 07. Foto: upload direto ao S3 · 2:05–2:25

A API só assina o formulário; o arquivo sai do cliente direto para o S3 (no
MiniStack). Esse envio não passa pela API, então não aparece no Swagger.

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Bruno | Uploads | `POST /uploads` com `{ "finalidade": "ATIVIDADE", "tipoConteudo": "image/png" }` | `201` com `url`, `campos` e `urlPublica` |
| — | terminal | envio do PNG para a `url` assinada | S3 responde `204` |
| — | navegador | abrir a `urlPublica` | a imagem aparece |
| Bruno | Atividades - Catalogo | `POST /atividades` | `201` com a mesma `fotoUrl` |

Para o envio, use o comando da
[seção 6 do happy path](happy-path.md#6-foto-enviada-direto-para-o-s3-rf09),
trocando `foto.png` por um PNG de verdade, como `docs/stylesheets/assets/logo.png`.
O item novo do catálogo usa a foto:

```json
{ "nome": "Passeio com foto 1", "tipoAtividade": "OUTRO", "fotoUrl": "<urlPublica>" }
```

### 08. Orçamento e notificações · 2:25–2:45

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Bruno | Orcamento | `PUT /viagens/{id}/orcamento` com `{ "valorTotal": 5000 }` | `200` |
| Ana | Orcamento | `GET /viagens/{id}/orcamento/resumo` | `"saldoDisponivel": "4879.50"` (5000 menos os 120,50 da atividade) |
| Ana | Notificacoes | `GET /notificacoes` | avisos das mudanças que Bruno fez na viagem |

### 09. Concluir, avaliar e países visitados · 2:45–3:05

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Ana | Atividades - Viagem | `PATCH /viagens/{id}/atividades/{atividadeId}` com `{ "status": "CONCLUIDA" }` | `200` |
| Ana | Viagens | `PATCH /viagens/{id}` com `{ "status": "CONCLUIDA" }` | `200` |
| Ana | Avaliacoes | `PUT /atividades/{lugarId}/avaliacoes/minha` | `201` |
| — | Atividades - Catalogo | `GET /atividades/{lugarId}` | `mediaAvaliacao` já conta a nota 5 |
| Ana | Usuarios | `GET /usuarios/eu/paises-visitados` | a lista inclui Portugal (`"codigo": "PT"`) |

```json
{ "nota": 5, "comentario": "Otima experiencia no Porto." }
```

### 10. Remover colaborador e perder acesso · 3:05–3:20

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| Ana | Colaboracao | `DELETE /viagens/{id}/membros/{membroId}` | `204` |
| Bruno | Viagens | `GET /viagens/{id}` | `404` |
| Bruno | Viagens | `GET /viagens` | a viagem sumiu da lista |

### 11. Recuperação via fila, worker e e-mail · 3:20–3:50

| Conta | Seção | Chamada | Esperado |
| ----- | ----- | ------- | -------- |
| — | Autenticacao | `POST /auth/recuperar-senha` com o e-mail de Bruno | `202` |
| — | navegador | abrir <http://localhost:4566/_ministack/ses/messages> | e-mail com `ViajaJunto: 123456` (o código de 6 dígitos) |
| — | Autenticacao | `POST /auth/verificar-codigo` com e-mail e código | `200` com `tokenTroca` |
| — | Autenticacao | `POST /auth/redefinir-senha` | `200`, senha redefinida |
| Bruno (token antigo) | Usuarios | `GET /usuarios/eu` | `401`: a troca encerrou as sessões |
| — | Autenticacao | `POST /auth/login` com a senha nova | `200` |

O e-mail leva alguns segundos para chegar: a API publica na fila SQS e o worker
envia pelo SES. Se a porta do MiniStack mudou, troque `4566` pelo `MINISTACK_PORT`.

```json
{ "tokenTroca": "...", "novaSenha": "novaSenha12345", "confirmarNovaSenha": "novaSenha12345" }
```

### 12. Contrato e resultado · 3:50–4:00

Abra <http://localhost:3000/api/docs-json>: é o contrato OpenAPI que qualquer
front pode usar para gerar o cliente (`"title": "ViajaJunto API"`). Volte ao
Swagger para fechar o vídeo.

## Depois de gravar

O que foi criado à mão no Swagger fica no banco. Num ambiente usado só para a
demo, `docker compose down -v` apaga tudo, inclusive os dados. Para o ensaio do
terminal, o `--limpar` já remove o que ele criou.
