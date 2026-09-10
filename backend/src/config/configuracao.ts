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
  },

  integracoes: {
    googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  },
});

export type Configuracao = ReturnType<typeof configuracao>;
