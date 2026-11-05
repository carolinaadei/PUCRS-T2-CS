-- Padronizacao da API: notificacoes persistidas, sessoes com refresh token,
-- codigo de convite separado do id da viagem e autoria dos itens de catalogo.

-- CreateEnum
CREATE TYPE "tipo_notificacao" AS ENUM ('VIAGEM_ATUALIZADA', 'DESTINO_ADICIONADO', 'DESTINO_ATUALIZADO', 'DESTINO_REMOVIDO', 'ATIVIDADE_ADICIONADA', 'ATIVIDADE_ATUALIZADA', 'ATIVIDADE_REMOVIDA', 'ORCAMENTO_ATUALIZADO', 'ORCAMENTO_REMOVIDO', 'MEMBRO_ENTROU', 'MEMBRO_SAIU', 'MEMBRO_REMOVIDO', 'PERMISSAO_ALTERADA');

-- AlterTable
ALTER TABLE "avaliacao" ADD COLUMN     "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "catalogo_atividade" ADD COLUMN     "criado_por" INTEGER,
ALTER COLUMN "fonte" SET DEFAULT 'manual';

-- AlterTable
ALTER TABLE "destino_catalogo" ADD COLUMN     "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "criado_por" INTEGER;

-- O codigo de convite passa a ser uma coluna propria. As viagens existentes
-- recebem o proprio id como codigo, para os convites ja enviados continuarem
-- valendo; daqui em diante o criador pode gerar outro.
ALTER TABLE "viagem" ADD COLUMN     "codigo_convite" VARCHAR(12);
UPDATE "viagem" SET "codigo_convite" = "id";
ALTER TABLE "viagem" ALTER COLUMN "codigo_convite" SET NOT NULL;

-- A ordem dos destinos passa a ser uma sequencia 0..n-1 por viagem. Antes ela
-- aceitava repeticao; aqui os empates sao desfeitos pela chegada e pelo id.
UPDATE "destino_viagem" AS dv
SET "ordem" = sub.posicao
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "viagem_id" ORDER BY "ordem", "chegada" NULLS LAST, "id") - 1 AS posicao
  FROM "destino_viagem"
) AS sub
WHERE dv."id" = sub."id";

-- CreateTable
CREATE TABLE "sessao_refresh" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "revogada_em" TIMESTAMP(3),
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessao_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacao" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "viagem_id" VARCHAR(12) NOT NULL,
    "tipo" "tipo_notificacao" NOT NULL,
    "mensagem" TEXT NOT NULL,
    "lida_em" TIMESTAMP(3),
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessao_refresh_token_hash_key" ON "sessao_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sessao_refresh_usuario_id_revogada_em_idx" ON "sessao_refresh"("usuario_id", "revogada_em");

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_criada_em_idx" ON "notificacao"("usuario_id", "criada_em" DESC);

-- CreateIndex
CREATE INDEX "notificacao_usuario_id_lida_em_idx" ON "notificacao"("usuario_id", "lida_em");

-- CreateIndex
CREATE INDEX "atividade_viagem_catalogo_atividade_id_idx" ON "atividade_viagem"("catalogo_atividade_id");

-- CreateIndex
CREATE INDEX "catalogo_atividade_criado_por_idx" ON "catalogo_atividade"("criado_por");

-- CreateIndex
CREATE INDEX "destino_catalogo_criado_por_idx" ON "destino_catalogo"("criado_por");

-- CreateIndex
CREATE UNIQUE INDEX "viagem_codigo_convite_key" ON "viagem"("codigo_convite");

-- AddForeignKey
ALTER TABLE "sessao_refresh" ADD CONSTRAINT "sessao_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "destino_catalogo" ADD CONSTRAINT "destino_catalogo_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo_atividade" ADD CONSTRAINT "catalogo_atividade_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_viagem_id_fkey" FOREIGN KEY ("viagem_id") REFERENCES "viagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
