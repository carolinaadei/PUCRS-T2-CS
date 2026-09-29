-- CreateEnum
CREATE TYPE "status_viagem" AS ENUM ('EM_PLANEJAMENTO', 'CONFIRMADA', 'CONCLUIDA');

-- CreateEnum
CREATE TYPE "permissao_membro" AS ENUM ('EDITOR', 'VISUALIZADOR');

-- CreateEnum
CREATE TYPE "categoria_destino" AS ENUM ('CIDADE', 'PRAIA', 'NATUREZA', 'CULTURAL');

-- CreateEnum
CREATE TYPE "tipo_atividade" AS ENUM ('PASSEIO', 'REFEICAO', 'HOSPEDAGEM', 'TRANSPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "status_atividade" AS ENUM ('PENDENTE', 'CONFIRMADA', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "usuario" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "senha_hash" VARCHAR(255) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "viagem" (
    "id" VARCHAR(12) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "data_inicio" DATE,
    "data_fim" DATE,
    "status" "status_viagem" NOT NULL DEFAULT 'EM_PLANEJAMENTO',
    "criado_por" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membro_viagem" (
    "id" SERIAL NOT NULL,
    "viagem_id" VARCHAR(12) NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "permissao" "permissao_membro" NOT NULL,
    "entrou_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membro_viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destino_catalogo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "pais" VARCHAR(80),
    "categoria" "categoria_destino",
    "descricao" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "foto_url" VARCHAR(500),

    CONSTRAINT "destino_catalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destino_viagem" (
    "id" SERIAL NOT NULL,
    "viagem_id" VARCHAR(12) NOT NULL,
    "destino_catalogo_id" INTEGER NOT NULL,
    "chegada" DATE,
    "saida" DATE,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "destino_viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo_atividade" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(180) NOT NULL,
    "descricao" TEXT,
    "tipo_atividade" "tipo_atividade" NOT NULL,
    "local" VARCHAR(255),
    "cidade" VARCHAR(120),
    "pais" VARCHAR(80),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "google_place_id" VARCHAR(255),
    "foto_url" VARCHAR(500),
    "fonte" VARCHAR(40) NOT NULL DEFAULT 'google_places',
    "media_avaliacao" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalogo_atividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atividade_viagem" (
    "id" SERIAL NOT NULL,
    "destino_viagem_id" INTEGER NOT NULL,
    "catalogo_atividade_id" INTEGER NOT NULL,
    "data_horario" TIMESTAMP(3),
    "duracao_min" INTEGER,
    "custo_previsto" DECIMAL(10,2),
    "status" "status_atividade" NOT NULL DEFAULT 'PENDENTE',

    CONSTRAINT "atividade_viagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento" (
    "id" SERIAL NOT NULL,
    "viagem_id" VARCHAR(12) NOT NULL,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "previsto_atividades" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "orcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacao" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "catalogo_atividade_id" INTEGER NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "viagem_criado_por_idx" ON "viagem"("criado_por");

-- CreateIndex
CREATE INDEX "membro_viagem_usuario_id_idx" ON "membro_viagem"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "membro_viagem_viagem_id_usuario_id_key" ON "membro_viagem"("viagem_id", "usuario_id");

-- CreateIndex
CREATE INDEX "destino_catalogo_nome_idx" ON "destino_catalogo"("nome");

-- CreateIndex
CREATE INDEX "destino_viagem_viagem_id_idx" ON "destino_viagem"("viagem_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalogo_atividade_google_place_id_key" ON "catalogo_atividade"("google_place_id");

-- CreateIndex
CREATE INDEX "catalogo_atividade_nome_idx" ON "catalogo_atividade"("nome");

-- CreateIndex
CREATE INDEX "catalogo_atividade_tipo_atividade_idx" ON "catalogo_atividade"("tipo_atividade");

-- CreateIndex
CREATE INDEX "atividade_viagem_destino_viagem_id_idx" ON "atividade_viagem"("destino_viagem_id");

-- CreateIndex
CREATE INDEX "atividade_viagem_data_horario_idx" ON "atividade_viagem"("data_horario");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_viagem_id_key" ON "orcamento"("viagem_id");

-- CreateIndex
CREATE INDEX "avaliacao_catalogo_atividade_id_idx" ON "avaliacao"("catalogo_atividade_id");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacao_usuario_id_catalogo_atividade_id_key" ON "avaliacao"("usuario_id", "catalogo_atividade_id");

-- AddForeignKey
ALTER TABLE "viagem" ADD CONSTRAINT "viagem_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membro_viagem" ADD CONSTRAINT "membro_viagem_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "viagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membro_viagem" ADD CONSTRAINT "membro_viagem_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destino_viagem" ADD CONSTRAINT "destino_viagem_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "viagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destino_viagem" ADD CONSTRAINT "destino_viagem_destino_catalogo_id_fkey" FOREIGN KEY ("destino_catalogo_id") REFERENCES "destino_catalogo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_viagem" ADD CONSTRAINT "atividade_viagem_destino_viagem_id_fkey" FOREIGN KEY ("destino_viagem_id") REFERENCES "destino_viagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atividade_viagem" ADD CONSTRAINT "atividade_viagem_catalogo_atividade_id_fkey" FOREIGN KEY ("catalogo_atividade_id") REFERENCES "catalogo_atividade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento" ADD CONSTRAINT "orcamento_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "viagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacao" ADD CONSTRAINT "avaliacao_catalogo_atividade_id_fkey" FOREIGN KEY ("catalogo_atividade_id") REFERENCES "catalogo_atividade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
