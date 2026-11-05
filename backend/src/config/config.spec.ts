import { configuracao } from './configuracao';
import { gerarOperationId } from './swagger';
import { padroesDeDesenvolvimentoEmUso, validarEnv } from './validacao-env';

const base = { DATABASE_URL: 'postgresql://x' };

const producao = {
  ...base,
  NODE_ENV: 'production',
  JWT_SECRET: 'j'.repeat(32),
  RECUPERACAO_CODIGO_SECRET: 'r'.repeat(32),
  MAIL_PROVEDOR: 'ses',
  EMAIL_REMETENTE: 'nao-responda@viajajunto.com',
};

describe('validarEnv', () => {
  it('em desenvolvimento sobe so com o banco', () => {
    expect(() => validarEnv(base)).not.toThrow();
  });

  it('sem DATABASE_URL nunca sobe', () => {
    expect(() => validarEnv({})).toThrow('DATABASE_URL e obrigatoria');
  });

  it('em producao aceita a configuracao completa', () => {
    expect(() => validarEnv(producao)).not.toThrow();
  });

  it.each([
    ['JWT_SECRET', { JWT_SECRET: 'curto' }, 'JWT_SECRET e obrigatorio em producao'],
    [
      'segredo da recuperacao',
      { RECUPERACAO_CODIGO_SECRET: undefined },
      'RECUPERACAO_CODIGO_SECRET',
    ],
    ['e-mail no log', { MAIL_PROVEDOR: 'log' }, 'MAIL_PROVEDOR deve ser ses ou brevo em producao'],
    [
      'sem provedor',
      { MAIL_PROVEDOR: undefined },
      'MAIL_PROVEDOR deve ser ses ou brevo em producao',
    ],
    [
      'remetente invalido',
      { EMAIL_REMETENTE: 'nao-e-email' },
      'EMAIL_REMETENTE deve ser um e-mail',
    ],
  ])('em producao recusa %s', (_caso, ajuste, mensagem) => {
    expect(() => validarEnv({ ...producao, ...ajuste })).toThrow(mensagem);
  });

  it('o Brevo exige a chave em qualquer ambiente', () => {
    expect(() => validarEnv({ ...base, MAIL_PROVEDOR: 'brevo' })).toThrow('BREVO_API_KEY');
    expect(() => validarEnv({ ...base, MAIL_PROVEDOR: 'brevo', BREVO_API_KEY: 'k' })).not.toThrow();
  });

  it('confere o formato das URLs', () => {
    expect(() => validarEnv({ ...base, PUBLIC_URL: 'api.exemplo.com' })).toThrow('PUBLIC_URL');
    expect(() => validarEnv({ ...base, PUBLIC_URL: 'http://localhost:3000' })).not.toThrow();
  });
});

describe('configuracao', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('le CORS_ORIGINS como lista e cai nos dev servers comuns sem ela', () => {
    process.env.CORS_ORIGINS = ' http://a.com , http://b.com ,';
    expect(configuracao().corsOrigens).toEqual(['http://a.com', 'http://b.com']);

    delete process.env.CORS_ORIGINS;
    expect(configuracao().corsOrigens).toContain('http://localhost:5173');
  });

  it.each([
    [undefined, undefined],
    ['true', true],
    ['false', false],
    ['2', 2],
    ['loopback, 10.0.0.0/8', 'loopback, 10.0.0.0/8'],
  ])('TRUST_PROXY=%p vira %p', (valor, esperado) => {
    if (valor === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = valor;

    expect(configuracao().trustProxy).toBe(esperado);
  });

  it('PUBLIC_URL sem barra no fim, com padrao na porta da API', () => {
    delete process.env.PUBLIC_URL;
    process.env.PORT = '4000';
    expect(configuracao().urlPublica).toBe('http://localhost:4000');

    process.env.PUBLIC_URL = 'https://api.viajajunto.com//';
    expect(configuracao().urlPublica).toBe('https://api.viajajunto.com');
  });

  it('avisa quais padroes de desenvolvimento estao em uso', () => {
    delete process.env.JWT_SECRET;
    process.env.RECUPERACAO_CODIGO_SECRET = 'x';
    process.env.MAIL_PROVEDOR = 'ses';

    expect(padroesDeDesenvolvimentoEmUso()).toEqual(['JWT_SECRET']);
  });
});

describe('gerarOperationId', () => {
  it('junta o recurso e o metodo em camelCase', () => {
    expect(gerarOperationId('ViagensController', 'criar')).toBe('viagensCriar');
    expect(gerarOperationId('DestinosViagemController', 'listar')).toBe('destinosViagemListar');
  });
});
