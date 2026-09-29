# Imagem da API ViajaJunto.
#
# Multi-stage de proposito: o estagio de build carrega o Nest CLI, o ts-jest e o
# resto das devDependencies; nada disso precisa ir para producao, e cada pacote a
# menos na imagem final e uma vulnerabilidade a menos para o Trivy encontrar no CI.
#
# Sobre o Prisma: o `prisma generate` roda no estagio de build e o cliente gerado
# (node_modules/.prisma) e copiado para o runtime. O CLI do `prisma` e o
# `typescript` chegam na imagem final mesmo com --omit=dev, porque sao
# peerDependencies opcionais do @prisma/client e o npm as resolve pelo lockfile.
# Custam cerca de 110 MB, mas em troca dao `prisma migrate deploy` funcionando
# dentro da propria imagem - o que e como as migrations sao aplicadas no deploy.

ARG NODE_VERSION=22.20-alpine3.22

# ---------------------------------------------------------------------------
# Estagio 1: dependencias de producao, isoladas para o cache do Docker
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

COPY package.json package-lock.json ./

# `npm ci --omit=dev` respeita o lockfile: o build e reproduzivel.
RUN npm ci --omit=dev --ignore-scripts

# ---------------------------------------------------------------------------
# Estagio 2: build (TypeScript -> dist, e o cliente Prisma)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# O schema vem antes do resto do codigo: enquanto ele nao muda, o generate
# (que baixa engines) reaproveita a camada em cache.
COPY prisma ./prisma
RUN npm run prisma:generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Estagio 3: runtime
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# Tres coisas num unico RUN, para nao criar camadas intermediarias:
#
# 1. openssl: os engines do Prisma sao linkados contra o OpenSSL 3, e a imagem
#    alpine do Node nao traz a libssl - sem ela o cliente falha na primeira query.
#
# 2. apk upgrade: pega correcoes publicadas depois da tag da imagem base.
#
# 3. Remover npm, corepack e yarn: o runtime executa `node dist/main`, nao instala
#    nada. O npm que vem na imagem base carrega as proprias dependencias
#    empacotadas (tar, pacote, sigstore, glob...), e elas respondiam por 41 dos 43
#    achados HIGH/CRITICAL do Trivy nesta imagem - vulnerabilidades em codigo que
#    nunca e executado aqui. Apagar e mais honesto do que suprimir no .trivyignore.
RUN apk add --no-cache openssl \
  && apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm \
            /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm \
            /usr/local/bin/npx \
            /usr/local/bin/corepack \
            /opt/yarn-* \
            /usr/local/bin/yarn \
            /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
# Cliente Prisma gerado no build; sobrepoe o @prisma/client vazio do estagio deps.
COPY --from=build --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build --chown=node:node /app/dist ./dist
# O schema e as migrations acompanham a imagem para permitir `prisma migrate
# deploy` a partir de um container efemero no deploy.
COPY --chown=node:node prisma ./prisma

# Usuario sem privilegios (a imagem do Node ja traz o `node`, uid 1000).
USER node

EXPOSE 3000

# `/api/health` responde 200 mesmo com o banco fora do ar (status: degradado),
# entao aqui ele mede a API, nao o Postgres - que e o que um healthcheck de
# container deve medir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]
