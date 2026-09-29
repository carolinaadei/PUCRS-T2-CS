/**
 * Exporta o documento OpenAPI para `openapi.json`.
 *
 * O contrato so existe em memoria: e montado pelo `@nestjs/swagger` a partir dos
 * decorators dos controllers. O Spectral, no CI, precisa de um arquivo no disco,
 * e subir a API inteira (com banco) so para baixar o `/api/docs-json` seria caro
 * e frageil. Este script instancia a aplicacao com o Prisma substituido por um
 * mock - a mesma tecnica dos testes e2e - e escreve o JSON.
 *
 * Rode com `npm run openapi:gerar`. O arquivo gerado nao vai para o repositorio
 * (esta no .gitignore): e derivado do codigo, entao commita-lo criaria uma
 * segunda fonte de verdade que envelhece em silencio.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { criarDocumentoSwagger } from '../src/config/swagger';
import { PrismaService } from '../src/prisma/prisma.service';

const DESTINO = resolve(__dirname, '..', 'openapi.json');

/** Nenhuma rota e chamada aqui, so o ciclo de vida do modulo precisa passar. */
const prismaMock = {
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
};

async function gerar(): Promise<void> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prismaMock)
    .compile();

  const app = modulo.createNestApplication();

  // O prefixo entra nos paths do documento, entao precisa ser o mesmo do boot.
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api');
  await app.init();

  const documento = criarDocumentoSwagger(app);

  mkdirSync(dirname(DESTINO), { recursive: true });
  writeFileSync(DESTINO, `${JSON.stringify(documento, null, 2)}\n`, 'utf8');

  await app.close();

  console.log(`OpenAPI escrito em ${DESTINO}`);
}

gerar().catch((erro: unknown) => {
  console.error('Falha ao gerar o documento OpenAPI:', erro);
  process.exit(1);
});
