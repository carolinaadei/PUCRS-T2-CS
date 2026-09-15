import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sobe a aplicacao completa com o Prisma substituido por um mock, verificando
 * o grafo de modulos, a injecao de dependencias e as regras de acesso das rotas.
 * Nao exige PostgreSQL. Rode com: npm run test:e2e
 */
describe('AppModule (e2e)', () => {
  let app: INestApplication;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    destinoCatalogo: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde sem autenticacao', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200);
  });

  it('GET /api/destinos e publico para visitantes (RN01)', () => {
    return request(app.getHttpServer()).get('/api/destinos').expect(200);
  });

  it('GET /api/viagens exige autenticacao (RNF03)', () => {
    return request(app.getHttpServer()).get('/api/viagens').expect(401);
  });

  it('POST /api/auth/registrar rejeita payload invalido (400)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/registrar')
      .send({ nome: 'Teste', email: 'nao-e-email', senha: '123' })
      .expect(400);
  });

  describe('POST /api/auth/registrar - cadastro (RF01)', () => {
    const payload = {
      nome: 'Ana Souza',
      email: 'ana.souza@example.com',
      senha: 'senhaSegura123',
    };

    beforeEach(() => {
      prismaMock.usuario.findUnique.mockReset();
      prismaMock.usuario.create.mockReset();
    });

    it('cria a conta e devolve token + usuario (201)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);
      prismaMock.usuario.create.mockResolvedValue({ id: 1, ...payload, senha: undefined });

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .send(payload)
        .expect(201);

      expect(typeof resposta.body.accessToken).toBe('string');
      expect(resposta.body.usuario).toMatchObject({ id: 1, email: payload.email });
      expect(JSON.stringify(resposta.body)).not.toContain('senhaHash');
    });

    it('rejeita e-mail ja cadastrado (409)', async () => {
      prismaMock.usuario.findUnique.mockResolvedValue({ id: 1 });

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/registrar')
        .send(payload)
        .expect(409);

      expect(resposta.body.message).toBe('Ja existe uma conta com este e-mail');
      expect(prismaMock.usuario.create).not.toHaveBeenCalled();
    });

    it('rejeita campo nao declarado no DTO (400)', () => {
      prismaMock.usuario.findUnique.mockResolvedValue(null);

      return request(app.getHttpServer())
        .post('/api/auth/registrar')
        .send({ ...payload, admin: true })
        .expect(400);
    });
  });
});
