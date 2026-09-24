import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PermissaoMembro } from '@prisma/client';
import request from 'supertest';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Verifica o AcessoViagemGuard contra as regras de negocio de colaboracao.
 * Usa o Prisma mockado: nao exige PostgreSQL.
 */
describe('AcessoViagemGuard (e2e)', () => {
  const CRIADOR = { id: 1, nome: 'Criador da Viagem', email: 'criador@example.com' };
  const VISUALIZADOR = {
    id: 2,
    nome: 'Colaborador Visualizador',
    email: 'visualizador@example.com',
  };
  const ESTRANHO = { id: 3, nome: 'Usuario Externo', email: 'externo@example.com' };

  let app: INestApplication;
  let jwtService: JwtService;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: { findUnique: jest.fn() },
    viagem: { findUnique: jest.fn(), update: jest.fn() },
  };

  /** A viagem DEMO2027 pertence ao usuario 1; o usuario 2 e VISUALIZADOR. */
  function comViagemPadrao(usuarioIdConsultado: number) {
    prismaMock.viagem.findUnique.mockResolvedValue({
      id: 'DEMO2027',
      criadoPor: CRIADOR.id,
      membros:
        usuarioIdConsultado === VISUALIZADOR.id
          ? [{ permissao: PermissaoMembro.VISUALIZADOR }]
          : [],
    });
  }

  function tokenDe(usuario: { id: number; email: string }) {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...usuario, versaoSessao: 0 });
    return jwtService.sign({ sub: usuario.id, email: usuario.email, ver: 0 });
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(criarPipeValidacao());

    jwtService = modulo.get(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('RN06 - responde 404 para quem nao participa da viagem', async () => {
    const token = tokenDe(ESTRANHO);
    comViagemPadrao(ESTRANHO.id);

    await request(app.getHttpServer())
      .get('/api/viagens/DEMO2027')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('RN03 - VISUALIZADOR nao pode editar a viagem (403)', async () => {
    const token = tokenDe(VISUALIZADOR);
    comViagemPadrao(VISUALIZADOR.id);

    await request(app.getHttpServer())
      .patch('/api/viagens/DEMO2027')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo nome' })
      .expect(403);
  });

  it('RN02 - o criador pode editar a viagem', async () => {
    const token = tokenDe(CRIADOR);
    comViagemPadrao(CRIADOR.id);
    prismaMock.viagem.update.mockResolvedValue({ id: 'DEMO2027', nome: 'Novo nome' });

    await request(app.getHttpServer())
      .patch('/api/viagens/DEMO2027')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Novo nome' })
      .expect(200);
  });

  it('RN04 - somente o criador exclui a viagem', async () => {
    const token = tokenDe(VISUALIZADOR);
    comViagemPadrao(VISUALIZADOR.id);

    await request(app.getHttpServer())
      .delete('/api/viagens/DEMO2027')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('RF03 - token emitido antes de redefinir a senha deixa de valer (401)', async () => {
    const token = tokenDe(CRIADOR);
    comViagemPadrao(CRIADOR.id);
    // A redefinicao incrementa a versao de sessao; o token ainda carrega ver: 0.
    prismaMock.usuario.findUnique.mockResolvedValue({ ...CRIADOR, versaoSessao: 1 });

    await request(app.getHttpServer())
      .get('/api/viagens/DEMO2027')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('responde 404 quando o codigo da viagem nao existe', async () => {
    const token = tokenDe(CRIADOR);
    prismaMock.viagem.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/api/viagens/NAOEXIST')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
