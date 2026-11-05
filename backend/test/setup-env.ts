/**
 * Valores minimos de ambiente para os testes rodarem sem um `.env` no disco.
 *
 * `validarEnv` exige DATABASE_URL sempre (o Prisma le a variavel por conta
 * propria), entao sem isto a aplicacao nem sobe no CI, onde o `.env` nao existe
 * por estar no .gitignore. Os dados minimos tem fallback; as saidas externas
 * sao fixadas abaixo para nao usar a configuracao pessoal nem gastar creditos.
 *
 * As suites de test/integracao trocam esta DATABASE_URL pela DATABASE_URL_TESTE
 * (veja test/apoio/app.ts); as demais substituem o PrismaService por mock.
 *
 * Usado tambem por scripts/gerar-openapi.ts, que sobe o AppModule fora do Jest e
 * esbarra na mesma validacao.
 */

// Sem nenhum import ou export o TypeScript trata o arquivo como script global, e
// nao como modulo - o `await import()` do gerar-openapi.ts falha com TS2306. O
// Jest carrega este arquivo por setupFiles e nao se importa com a diferenca.
export {};
// O runtime do Prisma tambem pode ler .env. Fixe as saidas externas antes do
// primeiro import: suites AWS substituem estes valores pelo MiniStack de teste.
Object.assign(process.env, {
  NODE_ENV: 'test',
  GEOAPIFY_API_KEY: '',
  BREVO_API_KEY: '',
  MAIL_PROVEDOR: 'log',
  EMAIL_REMETENTE: 'nao-responda@viajajunto.local',
  SQS_FILA_EMAILS: '',
  S3_BUCKET_MIDIA: '',
});
const PADROES_DE_TESTE: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste?schema=public',
  JWT_SECRET: 'segredo-de-teste',
  RECUPERACAO_CODIGO_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

for (const [nome, valor] of Object.entries(PADROES_DE_TESTE)) {
  process.env[nome] ??= valor;
}
