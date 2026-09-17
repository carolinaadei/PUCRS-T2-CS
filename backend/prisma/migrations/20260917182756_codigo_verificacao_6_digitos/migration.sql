-- DropIndex
DROP INDEX "token_recuperacao_senha_token_hash_key";
-- DropIndex
DROP INDEX "token_recuperacao_senha_usuario_id_idx";
-- AlterTable
ALTER TABLE "token_recuperacao_senha" DROP COLUMN "token_hash",
ADD COLUMN     "codigo_hash" VARCHAR(64) NOT NULL,
ADD COLUMN     "tentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "troca_expira_em" TIMESTAMP(3),
ADD COLUMN     "troca_hash" VARCHAR(64),
ADD COLUMN     "verificado_em" TIMESTAMP(3);
-- CreateIndex
CREATE UNIQUE INDEX "token_recuperacao_senha_troca_hash_key" ON "token_recuperacao_senha"("troca_hash");
-- CreateIndex
CREATE INDEX "token_recuperacao_senha_usuario_id_usado_em_idx" ON "token_recuperacao_senha"("usuario_id", "usado_em");
