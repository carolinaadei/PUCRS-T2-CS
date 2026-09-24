import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testes de integracao de ponta a ponta (e2e) do fluxo de autenticacao (RF02).
 * Valida o comportamento HTTP e status codes de /api/auth/login e /api/auth/logout.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let tokenValido: string;

  const senhaCriptografada = bcrypt.hashSync('senha12345', 10);
  const usuarioMock = {
    id: 1,
    nome: 'Usuario Teste',
    email: 'usuario.teste@example.com',
    senhaHash: senhaCriptografada,
    criadoEm: new Date(),
  };

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: {
      findUnique: jest.fn(({ where }: { where: { id?: number; email?: string } }) => {
        if (where.email === 'usuario.teste@example.com' || where.id === 1) {
          return Promise.resolve(usuarioMock);
        }
        return Promise.resolve(null);
      }),
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

    jwtService = modulo.get(JwtService);
    tokenValido = jwtService.sign({ sub: 1, email: 'usuario.teste@example.com' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/auth/login (RF02)', () => {
    it('deve autenticar com credenciais validas e retornar 200 com token e usuario', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario.teste@example.com', senha: 'senha12345' })
        .expect(200);

      expect(resposta.body).toHaveProperty('accessToken');
      expect(resposta.body.usuario).toEqual({
        id: 1,
        nome: 'Usuario Teste',
        email: 'usuario.teste@example.com',
      });
    });

    it('deve retornar 401 quando o e-mail nao existir', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'inexistente@example.com', senha: 'senha12345' })
        .expect(401);
    });

    it('deve retornar 401 quando a senha estiver incorreta', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario.teste@example.com', senha: 'senhaIncorreta' })
        .expect(401);
    });

    it('deve retornar 400 quando o e-mail for invalido', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'formato-invalido', senha: 'senha12345' })
        .expect(400);
    });

    it('deve retornar 400 quando a senha nao for informada', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario.teste@example.com' })
        .expect(400);
    });
  });

  describe('POST /api/auth/logout (RF02)', () => {
    it('deve retornar 200 com mensagem de sucesso quando autenticado', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${tokenValido}`)
        .expect(200);

      expect(resposta.body).toEqual({
        mensagem: 'Logout realizado com sucesso',
      });
    });

    it('deve retornar 401 quando o token nao for fornecido', async () => {
      await request(app.getHttpServer()).post('/api/auth/logout').expect(401);
    });

    it('deve retornar 401 quando o token for invalido', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer token_invalido')
        .expect(401);
    });
  });
});
