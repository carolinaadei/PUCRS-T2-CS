#!/bin/sh
# Roda DENTRO do conteiner do MiniStack, sozinho, toda vez que ele sobe: e o
# gancho ready.d (o mesmo do LocalStack), montado pelo compose.yml. A imagem ja
# traz a AWS CLI e exporta AWS_ENDPOINT_URL e credenciais de teste, por isso os
# comandos abaixo nao levam --endpoint-url.
#
# Nao ha teste de "a pilha ja existe?": o estado do MiniStack e em memoria, entao
# todo boot comeca vazio e este script sempre cria do zero.
#
# Enquanto ele roda, /_ministack/ready responde 503; o healthcheck do compose
# olha esse endpoint, e por isso `docker compose up --wait` so termina com as
# pilhas prontas.
set -eu

modelo=file:///infra/viajajunto-local.yaml

echo '>> criando a pilha viajajunto-local'
aws cloudformation create-stack --stack-name viajajunto-local \
  --template-body "$modelo"

# Segunda pilha com Ambiente=dev, que liga o versionamento do bucket: e o par
# que mostra a Condition sendo avaliada (secao 4 do comandos.md).
echo '>> criando a pilha viajajunto-dev'
aws cloudformation create-stack --stack-name viajajunto-dev \
  --template-body "$modelo" \
  --parameters ParameterKey=Ambiente,ParameterValue=dev

aws cloudformation wait stack-create-complete --stack-name viajajunto-local
aws cloudformation wait stack-create-complete --stack-name viajajunto-dev

# Objeto de exemplo no bucket, para as URLs do navegador ja terem o que mostrar.
# O corpo e o proprio modelo: qualquer arquivo serve, e este ja esta montado.
echo '>> gravando fotos/gramado.jpg no bucket de midia'
aws s3api put-object --bucket viajajunto-local-midia \
  --key fotos/gramado.jpg --body /infra/viajajunto-local.yaml >/dev/null

echo '>> pilhas prontas'
