import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarSwagger } from '../src/config/swagger';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * A documentacao e gerada a partir dos decorators dos controllers, entao um
 * decorator duplicado ou perdido num merge nao quebra o build - some da pagina
 * em silencio. Estes testes leem o documento OpenAPI e cobram o contrato.
 *
 * O documento vem de `/api/docs-json`, e nao de uma chamada direta ao
 * DocumentBuilder: assim o teste cobre tambem a publicacao da rota, que e o que
 * o `main.ts` faz no boot.
 */
describe('Documento OpenAPI (e2e)', () => {
  let app: INestApplication;
  let documento: OpenAPIObject;

  const prismaMock = { $connect: jest.fn(), $disconnect: jest.fn() };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    configurarSwagger(app, 'api');
    await app.init();

    const resposta = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    documento = resposta.body as OpenAPIObject;
  });

  afterAll(async () => {
    await app.close();
  });

  it('publica a pagina interativa em /api/docs', () =>
    request(app.getHttpServer()).get('/api/docs').expect(200));

  it('identifica a API e a versao', () => {
    expect(documento.info.title).toBe('ViajaJunto API');
    expect(documento.info.version).toBe('0.1.0');
  });

  it('documenta todas as rotas de autenticacao (RF01 a RF03)', () => {
    expect(Object.keys(documento.paths)).toEqual(
      expect.arrayContaining([
        '/api/auth/registrar',
        '/api/auth/login',
        '/api/auth/logout',
        '/api/auth/recuperar-senha',
        '/api/auth/verificar-codigo',
        '/api/auth/redefinir-senha',
      ]),
    );
  });

  it('descreve o logout como rota autenticada que responde 200', () => {
    const logout = documento.paths['/api/auth/logout'].post!;

    expect(logout.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(logout.responses)).toEqual(expect.arrayContaining(['200', '401']));
    // O 501 era o placeholder de antes do RF02 ficar pronto.
    expect(logout.responses['501']).toBeUndefined();
  });

  it('nao deixa rota de autenticacao sem resumo nem tag', () => {
    const rotasDeAuth = Object.entries(documento.paths).filter(([rota]) =>
      rota.startsWith('/api/auth/'),
    );

    expect(rotasDeAuth.length).toBeGreaterThan(0);

    // O nome da rota vai no valor comparado: o expect do Jest nao aceita
    // mensagem, e uma lista vazia diz qual rota falhou quando quebra.
    const semResumo = rotasDeAuth.filter(([, caminho]) => !caminho.post!.summary);
    const foraDaTag = rotasDeAuth.filter(
      ([, caminho]) => caminho.post!.tags?.[0] !== 'Autenticacao',
    );

    expect(semResumo.map(([rota]) => rota)).toEqual([]);
    expect(foraDaTag.map(([rota]) => rota)).toEqual([]);
  });

  it('mantem as rotas publicas do RF03 sem exigir token', () => {
    const publicas = [
      '/api/auth/registrar',
      '/api/auth/login',
      '/api/auth/recuperar-senha',
      '/api/auth/verificar-codigo',
      '/api/auth/redefinir-senha',
    ];

    const exigindoToken = publicas.filter((rota) => documento.paths[rota].post!.security);

    expect(exigindoToken).toEqual([]);
  });

  it('registra os DTOs de resposta da autenticacao', () => {
    expect(Object.keys(documento.components!.schemas!)).toEqual(
      expect.arrayContaining([
        'RespostaAutenticacaoDto',
        'RespostaLogoutDto',
        'RespostaRecuperacaoDto',
        'RespostaVerificacaoDto',
        'RespostaRedefinicaoDto',
      ]),
    );
  });

  it('documenta as rotas dos demais modulos', () => {
    expect(Object.keys(documento.paths)).toEqual(
      expect.arrayContaining([
        '/api/usuarios/eu',
        '/api/viagens',
        '/api/viagens/{viagemId}',
        '/api/destinos',
        '/api/atividades',
        '/api/viagens/{viagemId}/orcamento',
        '/api/viagens/{viagemId}/membros',
        '/api/health',
      ]),
    );
  });
});
