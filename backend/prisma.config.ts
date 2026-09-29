import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Configuracao da CLI do Prisma (substitui a chave `prisma` do package.json,
 * descontinuada a partir do Prisma 7).
 *
 * O import de `dotenv/config` acima e necessario: com um arquivo de config,
 * a CLI nao carrega mais o `.env` automaticamente.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
