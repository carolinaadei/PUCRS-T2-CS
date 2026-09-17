/**
 * Configuracao centralizada da aplicacao, lida do ambiente (.env).
 * Registrada no AppModule via ConfigModule.forRoot({ load: [configuracao] }).
 */
export const configuracao = () => ({
  ambiente: process.env.NODE_ENV ?? 'development',
  porta: parseInt(process.env.PORT ?? '3000', 10),
  prefixoApi: process.env.API_PREFIX ?? 'api',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',

  jwt: {
    segredo: process.env.JWT_SECRET ?? 'segredo-de-desenvolvimento',
    expiraEm: process.env.JWT_EXPIRES_IN ?? '7d',
  },

  seguranca: {
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
    // RF03 - pepper do HMAC do codigo de 6 digitos. Separado do JWT_SECRET de
    // proposito: chaves com finalidades distintas nao devem compartilhar valor.
    segredoRecuperacao: process.env.RECUPERACAO_CODIGO_SECRET ?? '',
  },

  integracoes: {
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  },

  // Nao e mais usada pelo RF03 (o e-mail leva apenas o codigo), mas segue
  // disponivel para outros fluxos que precisem montar links para o front.
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',

  mail: {
    brevoApiKey: process.env.BREVO_API_KEY ?? '',
    remetenteEmail: process.env.BREVO_SENDER_EMAIL ?? '',
    remetenteNome: process.env.BREVO_SENDER_NOME ?? 'ViajaJunto',
  },
});

export type Configuracao = ReturnType<typeof configuracao>;
