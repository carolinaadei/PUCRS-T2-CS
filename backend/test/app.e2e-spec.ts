import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppDeTeste, bearer, criarApp } from './apoio/app';

/**
 * Comportamento HTTP comum a todas as rotas - formato de erro, versao, request
 * id, CORS, sondas de saude - com o Prisma substituido por um mock. Nao exige banco.
 */
describe('Convencoes da API (e2e)', () => {
  let t: AppDeTeste;
  let jwt: JwtService;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn(),
    $transaction: jest.fn((operacoes: Promise<unknown>[]) => Promise.all(operacoes)),
    usuario: { findUnique: jest.fn() },
    destinoCatalogo: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const tokenValido = (versao = 0) => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 1,
      nome: 'Ana',
      email: 'ana@teste.com',
      versaoSessao: 0,
    });
    return jwt.sign({ sub: 1, email: 'ana@teste.com', ver: versao });
  };

  beforeAll(async () => {
    t = await criarApp({
      ajustar: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
    jwt = t.app.get(JwtService);
  });

  afterAll(() => t.app.close());

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.destinoCatalogo.findMany.mockResolvedValue([]);
    prisma.destinoCatalogo.count.mockResolvedValue(0);
  });

  describe('sondas de saude', () => {
    it('/api/health/live responde sem tocar no banco e fora do versionamento', async () => {
      const { body } = await t.http().get('/api/health/live').expect(200);

      expect(body).toEqual({ status: 'ok', uptime: expect.any(Number) });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('/api/health/ready responde 503 com o banco fora do ar', async () => {
      prisma.$queryRaw.mockRejectedValueOnce(new Error('conexao recusada'));

      const { body } = await t.http().get('/api/health/ready').expect(503);
      expect(body).toMatchObject({ status: 'indisponivel', banco: 'indisponivel' });

      prisma.$queryRaw.mockResolvedValueOnce([1]);
      await t.http().get('/api/health/ready').expect(200);
    });
  });

  describe('versao e rotas', () => {
    it('as rotas ficam sob /api/v1', async () => {
      await t.http().get('/api/v1/destinos').expect(200);
      await t.http().get('/api/destinos').expect(404);
    });

    it('rota inexistente responde ROTA_NAO_ENCONTRADA no formato padrao', async () => {
      const resposta = await t.http().get('/api/v1/nao-existe?x=1').expect(404);

      expect(resposta.body).toEqual({
        statusCode: 404,
        codigo: 'ROTA_NAO_ENCONTRADA',
        mensagem: 'Rota nao encontrada: GET /api/v1/nao-existe',
        requestId: resposta.headers['x-request-id'],
        caminho: '/api/v1/nao-existe?x=1',
        timestamp: expect.any(String),
      });
    });
  });

  describe('formato de erro', () => {
    it('401 sem token traz o codigo NAO_AUTENTICADO em portugues', async () => {
      const { body } = await t.http().get('/api/v1/viagens').expect(401);

      expect(body).toMatchObject({
        codigo: 'NAO_AUTENTICADO',
        mensagem: 'Token de acesso ausente, invalido ou expirado',
      });
    });

    it('token de versao antiga responde SESSAO_ENCERRADA', async () => {
      const { body } = await t
        .http()
        .get('/api/v1/viagens')
        .set(bearer(tokenValido(7)))
        .expect(401);
      expect(body.codigo).toBe('SESSAO_ENCERRADA');
    });

    it('token de conta excluida responde USUARIO_NAO_ENCONTRADO', async () => {
      const token = tokenValido();
      prisma.usuario.findUnique.mockResolvedValueOnce(null);

      const { body } = await t.http().get('/api/v1/viagens').set(bearer(token)).expect(401);
      expect(body.codigo).toBe('USUARIO_NAO_ENCONTRADO');
    });

    it('id fora do formato vira ID_INVALIDO, sem chegar ao banco', async () => {
      for (const id of ['abc', '0', '-1', '1.5', '99999999999']) {
        const { body } = await t.http().get(`/api/v1/destinos/${id}`).expect(400);
        expect(body.codigo).toBe('ID_INVALIDO');
      }
      expect(prisma.destinoCatalogo.findUnique).not.toHaveBeenCalled();
    });

    it('JSON mal formado vira JSON_INVALIDO', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(body.codigo).toBe('JSON_INVALIDO');
    });

    it('corpo acima do limite vira CORPO_GRANDE_DEMAIS', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'a@b.com', senha: 'x'.repeat(200_000) })
        .expect(413);
      expect(body.codigo).toBe('CORPO_GRANDE_DEMAIS');
    });

    it('erro inesperado vira 500 ERRO_INTERNO sem vazar detalhes', async () => {
      prisma.destinoCatalogo.findUnique.mockRejectedValueOnce(new Error('senha do banco: hunter2'));

      const { body } = await t.http().get('/api/v1/destinos/1').expect(500);
      expect(body).toMatchObject({ codigo: 'ERRO_INTERNO' });
      expect(JSON.stringify(body)).not.toContain('hunter2');
    });

    it('violacao de indice unico vira REGISTRO_DUPLICADO sem nome de coluna', async () => {
      prisma.destinoCatalogo.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6',
          meta: { target: ['nome'] },
        }),
      );

      const { body } = await t
        .http()
        .post('/api/v1/destinos')
        .set(bearer(tokenValido()))
        .send({ nome: 'Lisboa' })
        .expect(409);
      expect(body).toMatchObject({ codigo: 'REGISTRO_DUPLICADO' });
      expect(body.mensagem).not.toContain('nome');
    });
  });

  describe('request id', () => {
    it('gera um id por requisicao e devolve no header', async () => {
      const resposta = await t.http().get('/api/health/live').expect(200);
      expect(resposta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('reaproveita o id do cliente quando e seguro, e descarta o que nao e', async () => {
      const valido = await t.http().get('/api/health/live').set('X-Request-Id', 'meu-front-123456');
      expect(valido.headers['x-request-id']).toBe('meu-front-123456');

      const suspeito = await t
        .http()
        .get('/api/health/live')
        .set('X-Request-Id', 'id com espacos <script>');
      expect(suspeito.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('CORS', () => {
    it('libera as origens configuradas e expoe o X-Request-Id', async () => {
      const resposta = await t
        .http()
        .options('/api/v1/viagens')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(resposta.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('nao libera origem desconhecida', async () => {
      const resposta = await t
        .http()
        .get('/api/health/live')
        .set('Origin', 'https://site-malicioso.example');

      expect(resposta.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
