/**
 * Valores minimos de ambiente para os testes rodarem sem um `.env` no disco.
 *
 * `validarEnv` exige DATABASE_URL sempre (o Prisma le a variavel por conta
 * propria), entao sem isto a aplicacao nem sobe no CI, onde o `.env` nao existe
 * por ser versionado no .gitignore. Atribuimos so o que estiver faltando: quem
 * tem um `.env` local continua rodando com os proprios valores.
 *
 * Nenhum teste toca o banco - o PrismaService e substituido por mock.
 *
 * Usado tambem por scripts/gerar-openapi.ts, que sobe o AppModule fora do Jest e
 * esbarra na mesma validacao.
 */

// Sem nenhum import ou export o TypeScript trata o arquivo como script global, e
// nao como modulo - o `await import()` do gerar-openapi.ts falha com TS2306. O
// Jest carrega este arquivo por setupFiles e nao se importa com a diferenca.
export {};
const PADROES_DE_TESTE: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste?schema=public',
  JWT_SECRET: 'segredo-de-teste',
  RECUPERACAO_CODIGO_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

for (const [nome, valor] of Object.entries(PADROES_DE_TESTE)) {
  process.env[nome] ??= valor;
}
