/**
 * Valores minimos de ambiente para os testes rodarem sem um `.env` no disco.
 *
 * `validarEnv` exige DATABASE_URL sempre (o Prisma le a variavel por conta
 * propria), entao sem isto a aplicacao nem sobe no CI, onde o `.env` nao existe
 * por ser versionado no .gitignore. Atribuimos so o que estiver faltando: quem
 * tem um `.env` local continua rodando com os proprios valores.
 *
 * Nenhum teste toca o banco - o PrismaService e substituido por mock.
 */
const PADROES_DE_TESTE: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste?schema=public',
  JWT_SECRET: 'segredo-de-teste',
  RECUPERACAO_CODIGO_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres',
};

for (const [nome, valor] of Object.entries(PADROES_DE_TESTE)) {
  process.env[nome] ??= valor;
}
