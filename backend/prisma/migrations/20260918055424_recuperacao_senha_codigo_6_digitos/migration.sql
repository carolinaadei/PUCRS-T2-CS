-- CreateTable
CREATE TABLE "token_recuperacao_senha" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "codigo_hash" VARCHAR(64) NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "verificado_em" TIMESTAMP(3),
    "troca_hash" VARCHAR(64),
    "troca_expira_em" TIMESTAMP(3),
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_recuperacao_senha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "token_recuperacao_senha_troca_hash_key" ON "token_recuperacao_senha"("troca_hash");

-- CreateIndex
CREATE INDEX "token_recuperacao_senha_usuario_id_usado_em_idx" ON "token_recuperacao_senha"("usuario_id", "usado_em");

-- AddForeignKey
ALTER TABLE "token_recuperacao_senha" ADD CONSTRAINT "token_recuperacao_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
