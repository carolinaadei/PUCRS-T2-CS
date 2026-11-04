import { PrismaService } from '../src/prisma/prisma.service';
import { AppDeTeste, criarApp } from './apoio/app';

/** Rate limit de verdade (storage em memoria do Throttler), sem banco. */
describe('Limites de requisicao (e2e)', () => {
  let t: AppDeTeste;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([1]),
    usuario: { findUnique: jest.fn().mockResolvedValue(null) },
  };

  beforeAll(async () => {
    t = await criarApp({
      comLimite: true,
      ajustar: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
  });

  afterAll(() => t.app.close());

  it('login: 10 tentativas por IP a cada 15 min; a 11a recebe MUITAS_REQUISICOES', async () => {
    for (let tentativa = 1; tentativa <= 10; tentativa++) {
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'alvo@teste.com', senha: `chute${tentativa}` })
        .expect(401);
    }

    const { body } = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'alvo@teste.com', senha: 'chute11' })
      .expect(429);

    expect(body).toMatchObject({
      codigo: 'MUITAS_REQUISICOES',
      mensagem: 'Muitas requisicoes; aguarde um pouco e tente novamente',
    });
  });

  it('as sondas de saude nao entram no limite', async () => {
    for (let i = 0; i < 120; i++) {
      await t.http().get('/api/health/live').expect(200);
    }
  });
});
