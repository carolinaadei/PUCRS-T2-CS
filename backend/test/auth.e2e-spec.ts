import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testes de integracao de ponta a ponta (e2e) do fluxo de autenticacao (RF02).
 * Valida o comportamento HTTP e os status codes de /api/auth/login e
 * /api/auth/logout, incluindo a revogacao dos tokens ja emitidos.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  const senhaCriptografada = bcrypt.hashSync('senha12345', 10);

  // Mutavel de proposito: o logout incrementa `versaoSessao` e o `findUnique`
  // seguinte precisa enxergar o novo valor, como aconteceria no banco.
  let usuarioMock: {
    id: number;
    nome: string;
    email: string;
    senhaHash: string;
    versaoSessao: number;
    criadoEm: Date;
  };

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: {
      findUnique: jest.fn(({ where }: { where: { id?: number; email?: string } }) => {
        if (where.email === usuarioMock.email || where.id === usuarioMock.id) {
          return Promise.resolve({ ...usuarioMock });
        }
        return Promise.resolve(null);
      }),
      create: jest.fn(),
      update: jest.fn(({ data }: { data: { versaoSessao?: { increment: number } } }) => {
        if (data.versaoSessao) {
          usuarioMock.versaoSessao += data.versaoSessao.increment;
        }
        return Promise.resolve({ ...usuarioMock });
      }),
    },
  };

  /** Token assinado com a versao de sessao vigente, como o login faria. */
  const assinarToken = () =>
    jwtService.sign({
      sub: usuarioMock.id,
      email: usuarioMock.email,
      ver: usuarioMock.versaoSessao,
    });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    // O mesmo pipe do bootstrap, para o teste exercitar a configuracao real.
    app.useGlobalPipes(criarPipeValidacao());

    await app.init();

    jwtService = modulo.get(JwtService);
  });

  beforeEach(() => {
    usuarioMock = {
      id: 1,
      nome: 'Usuario Teste',
      email: 'usuario.teste@example.com',
      senhaHash: senhaCriptografada,
      versaoSessao: 0,
      criadoEm: new Date(),
    };
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

    it('deve emitir um token aceito pelas rotas autenticadas', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'usuario.teste@example.com', senha: 'senha12345' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/usuarios/eu')
        .set('Authorization', `Bearer ${resposta.body.accessToken}`)
        .expect(200);
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
        .set('Authorization', `Bearer ${assinarToken()}`)
        .expect(200);

      expect(resposta.body).toEqual({
        mensagem: 'Logout realizado com sucesso',
      });
    });

    it('deve invalidar os tokens ja emitidos: o mesmo token passa a receber 401', async () => {
      const token = assinarToken();

      await request(app.getHttpServer())
        .get('/api/usuarios/eu')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // A assinatura e o prazo do token continuam validos; o que mudou foi a
      // versao de sessao do usuario, e e isso que a JwtStrategy recusa.
      await request(app.getHttpServer())
        .get('/api/usuarios/eu')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
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
