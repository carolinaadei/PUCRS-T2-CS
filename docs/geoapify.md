# Geoapify: configurar, buscar e importar

A integração está implementada. A API oferece geocodificação/autocompletar de
cidades, busca de lugares próximos e importação para os catálogos locais.
A chave fica no servidor; nenhum frontend precisa recebê-la.

## Configuração local

1. Se ainda não existir, copie `backend/.env.example` para `backend/.env`.
2. Preencha somente o valor de `GEOAPIFY_API_KEY` com sua chave real.
3. Na raiz do repositório, execute:

```bash
docker compose --env-file backend/.env up -d --build --wait
```

O arquivo também define as portas: `API_PORT=3000`, `POSTGRES_PORT=55432` e
`MINISTACK_PORT=4566` no exemplo. O banco usa a porta 5432 dentro da rede Docker.
No host, a `DATABASE_URL` deve usar a mesma porta de `POSTGRES_PORT`.

Abra <http://localhost:3000/api/docs>. Faça login e use **Authorize** com o
`accessToken`. Todas as rotas de lugares exigem autenticação e têm limite de
20 chamadas por minuto por IP e por rota. Os exemplos abaixo são caminhos sob
`/api/v1`; os campos e respostas também estão documentados no Swagger.

Sem chave, as consultas externas retornam `503 GEOAPIFY_INDISPONIVEL`, enquanto
o catálogo já salvo continua disponível. Após mudar a chave, recrie o processo:

```bash
docker compose --env-file backend/.env up -d --force-recreate api
```

Para rodar a API pelo Node no host, use o mesmo `backend/.env` e
`npm run start:dev` dentro de `backend/`. Na AWS, a variável pode vir do ambiente
ou de um segredo JSON com `GEOAPIFY_API_KEY`, lido pelo mecanismo existente
`CONFIG_AWS_SEGREDOS`.

## Fluxo de uso

| Operação | Requisição |
| --- | --- |
| Buscar cidade | `GET /lugares/cidades?busca=Porto&pais=pt` |
| Autocompletar cidade | `GET /lugares/cidades?busca=Por&pais=pt&autocompletar=true` |
| Buscar pontos turísticos | `GET /lugares/atividades?latitude=41.1496&longitude=-8.6109&tipoAtividade=PASSEIO&raio=5000&limite=5` |
| Importar cidade | `POST /lugares/destinos/importar` |
| Importar atividade | `POST /lugares/atividades/importar` |

As buscas retornam arrays de lugares normalizados. Copie o `idExterno` do item
escolhido e envie ao endpoint de importação correspondente:

```json
{ "idExterno": "COLE_O_IDENTIFICADOR_DA_BUSCA" }
```

A importação confirma os detalhes na Geoapify e retorna `201`, com o item do
catálogo interno. O fornecedor pode devolver um `idExterno` canônico diferente
do identificador da busca. Importações repetidas ou concorrentes desse lugar
reutilizam o mesmo item, preservando autor, fotos e avaliações.

Use o **`id` numérico retornado pela importação** em `destinoCatalogoId` ou
`catalogoAtividadeId` ao montar uma viagem. O `idExterno` serve para identificar
o lugar no fornecedor. O cadastro manual permanece disponível; origem, ID
externo e créditos são controlados pelo servidor e não são aceitos no cadastro
ou na edição manual.

Consulte primeiro `GET /destinos?busca=...` ou `GET /atividades?busca=...` para
reutilizar o catálogo existente. A importação deduplica pela identidade externa;
ela não une automaticamente um item manual ou do seed a outro de mesmo nome.

## Categorias e dados

| `TipoAtividade` | Categoria consultada |
| --- | --- |
| `PASSEIO` | `tourism` |
| `REFEICAO` | `catering` |
| `HOSPEDAGEM` | `accommodation` |
| `TRANSPORTE` | `public_transport` |
| `OUTRO` | `leisure` |

Coordenadas são normalizadas para `latitude` e `longitude`. O filtro do
fornecedor usa longitude antes da latitude. Resultados sem identificador, nome
ou coordenadas válidas são descartados. Somente cidades com país podem ser
importadas como destino. O ISO alfa-2 é salvo em `codigoPais` e utilizado pelo
mapa de países visitados, que continua dependendo de viagens concluídas.

Fotos e avaliações são do ViajaJunto: use o upload existente e as avaliações
da comunidade. A importação não inventa fotos ou notas do fornecedor.

## Créditos e armazenamento

Os itens importados persistem `fonte`, `idExterno`, `codigoPais` e `atribuicoes`.
Os créditos aparecem também em listagens, detalhes e itens dentro de viagens:

```json
{
  "fonte": "geoapify",
  "atribuicoes": [
    { "texto": "Powered by Geoapify", "url": "https://www.geoapify.com/" },
    { "texto": "© OpenStreetMap contributors", "url": "https://www.openstreetmap.org/copyright" }
  ]
}
```

O frontend deve exibir esses textos e links junto dos dados. A API preserva
também créditos adicionais informados pelo fornecedor. A
[FAQ de Places](https://www.geoapify.com/places-api/) permite cache, armazenamento
e redistribuição com atribuição. Consulte os
[termos da Geoapify](https://www.geoapify.com/terms-and-conditions/) e a
[licença do OpenStreetMap](https://www.openstreetmap.org/copyright) antes de publicar.

Segundo os [preços consultados em 04/11/2026](https://www.geoapify.com/pricing/),
o plano gratuito oferece 3.000 créditos/dia, até 5 requisições/segundo, sem cartão.
Places custa um crédito por grupo de até 20 resultados. Details e geocodificação
têm cobrança própria. O cache em memória guarda até 100 consultas por cinco
minutos, por processo; múltiplas instâncias precisam coordenar cota e cache.

## Falhas e testes

- Timeout de oito segundos, erro de rede, chave recusada ou resposta inválida:
  `503 GEOAPIFY_INDISPONIVEL`.
- Cota/limite do fornecedor: `503 GEOAPIFY_LIMITE`.
- Lugar inexistente: `404 LUGAR_NAO_ENCONTRADO`.
- Importar um ponto de interesse como cidade: `400 LUGAR_INVALIDO`.
- Entrada inválida: `400 VALIDACAO`; excesso de chamadas locais: `429`.

A API não devolve o corpo de erros externos nem a URL com a chave. A reimportação
usando o `idExterno` canônico de um registro salvo também funciona sem chave.

Os testes usam respostas externas simuladas e PostgreSQL/MiniStack reais nas
suítes de integração. O modo de testes ignora o `.env` pessoal e não consome a
chave da equipe. A conferência real é feita à parte, com poucas consultas.

Como o banco local foi recriado, o schema inicial já usa os campos novos.
Não há migration de conversão, campos Google nem compatibilidade com o contrato
anterior. Uma base antiga precisa ser recriada antes de usar este schema.

Referências técnicas: [Places](https://apidocs.geoapify.com/docs/places/),
[Details](https://apidocs.geoapify.com/docs/place-details/),
[Geocoding](https://apidocs.geoapify.com/docs/geocoding/),
[Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/).
