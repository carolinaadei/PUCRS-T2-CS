/** Origens liberadas no CORS quando CORS_ORIGINS nao e definida: os dev servers mais comuns. */
const ORIGENS_PADRAO = ['http://localhost:3001', 'http://localhost:5173', 'http://localhost:4200'];

const lista = (valor: string | undefined): string[] =>
  (valor ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * `TRUST_PROXY` vai direto para o `trust proxy` do Express: "true", um numero de
 * saltos ("1") ou uma lista de sub-redes ("loopback, 10.0.0.0/8"). Sem ele, atras
 * de um proxy todo mundo chega com o IP do proxy e divide o mesmo rate limit.
 */
function interpretarTrustProxy(valor: string | undefined): boolean | number | string | undefined {
  if (!valor) return undefined;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  if (/^\d+$/.test(valor)) return Number(valor);
  return valor;
}

/**
 * Configuracao centralizada da aplicacao, lida do ambiente (.env).
 * Registrada no AppModule via ConfigModule.forRoot({ load: [configuracao] }).
 */
export const configuracao = () => {
  const porta = parseInt(process.env.PORT ?? '3000', 10);
  const origens = lista(process.env.CORS_ORIGINS);

  return {
    ambiente: process.env.NODE_ENV ?? 'development',
    porta,
    prefixoApi: process.env.API_PREFIX ?? 'api',
    // Endereco pelo qual o cliente alcanca a API. Vai para o `servers` do
    // OpenAPI, que e para onde o "Try it out" do Swagger manda as requisicoes.
    urlPublica: (process.env.PUBLIC_URL || `http://localhost:${porta}`).replace(/\/+$/, ''),
    corsOrigens: origens.length > 0 ? origens : ORIGENS_PADRAO,
    trustProxy: interpretarTrustProxy(process.env.TRUST_PROXY),
    geoapify: { apiKey: process.env.GEOAPIFY_API_KEY?.trim() || undefined },

    // Nos segredos o fallback usa `||`, nao `??`: o .env.example deixa a chave
    // vazia (`CHAVE=`), e o dotenv entrega '' em vez de undefined. Com `??` a
    // string vazia passaria direto e viraria a chave do HMAC/JWT.
    jwt: {
      segredo: process.env.JWT_SECRET || 'segredo-de-desenvolvimento',
      expiraEm: process.env.JWT_EXPIRES_IN || '15m',
      diasRefresh: parseInt(process.env.REFRESH_TOKEN_DIAS ?? '30', 10),
    },

    seguranca: {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
      // Pepper do HMAC do codigo de 6 digitos. Separado do JWT_SECRET de
      // proposito: chaves com finalidades distintas nao devem compartilhar valor.
      segredoRecuperacao:
        process.env.RECUPERACAO_CODIGO_SECRET || 'segredo-de-desenvolvimento-da-recuperacao',
    },

    mail: {
      // log: escreve o e-mail no terminal; ses: Amazon SES (ou o MiniStack);
      // brevo: API transacional do Brevo.
      provedor: (process.env.MAIL_PROVEDOR || 'log') as 'log' | 'ses' | 'brevo',
      remetenteEmail: process.env.EMAIL_REMETENTE || 'nao-responda@viajajunto.local',
      remetenteNome: process.env.EMAIL_REMETENTE_NOME || 'ViajaJunto',
      brevoApiKey: process.env.BREVO_API_KEY ?? '',
    },

    aws: {
      regiao: process.env.AWS_REGION || 'us-east-1',
      // Definido so fora da AWS (MiniStack). Na AWS de verdade fica vazio e o
      // SDK resolve os endpoints sozinho - o mesmo codigo roda nos dois lugares.
      endpoint: process.env.AWS_ENDPOINT_URL || undefined,
      bucketMidia: process.env.S3_BUCKET_MIDIA || undefined,
      // Endereco do S3 que o navegador alcanca. Dentro do compose a API fala com
      // `ministack:4566`, nome que o navegador nao resolve.
      endpointPublicoS3: process.env.S3_ENDPOINT_PUBLICO || undefined,
      tamanhoMaximoUploadMb: parseInt(process.env.UPLOAD_TAMANHO_MAXIMO_MB ?? '5', 10),
      filaEmails: process.env.SQS_FILA_EMAILS || undefined,
    },
  };
};

export type Configuracao = ReturnType<typeof configuracao>;
