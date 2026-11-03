import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExcecaoPrismaFilter } from '../src/common/filters/excecao-prisma.filter';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testes de integracao de ponta a ponta (e2e) do Modulo 7 - Avaliacao de Atividades
 * (RF22, RF23, RN01 e RN05).
 * Valida o comportamento HTTP, autenticacao via JWT, autorizacao de exclusao e contratos Swagger.
 */
describe('Avaliacoes (e2e)', () => {
  const AUTOR = { id: 1, nome: 'Ana Autora', email: 'ana@example.com', versaoSessao: 0 };
  const OUTRO_USUARIO = {
    id: 2,
    nome: 'Bruno Outro',
    email: 'bruno@example.com',
    versaoSessao: 0,
  };

  let app: INestApplication;
  let jwtService: JwtService;
  let tokenAutor: string;
  let tokenOutro: string;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: {
      findUnique: jest.fn(({ where }: { where: { id?: number; email?: string } }) => {
        if (where.id === AUTOR.id || where.email === AUTOR.email) {
          return Promise.resolve({ ...AUTOR, senhaHash: 'hash' });
        }
        if (where.id === OUTRO_USUARIO.id || where.email === OUTRO_USUARIO.email) {
          return Promise.resolve({ ...OUTRO_USUARIO, senhaHash: 'hash' });
        }
        return Promise.resolve(null);
      }),
    },
    catalogoAtividade: {
      findUnique: jest.fn(({ where }: { where: { id: number } }) => {
        if (where.id === 10) {
          return Promise.resolve({
            id: 10,
            nome: 'Torre de Belem',
            tipoAtividade: 'PASSEIO',
            mediaAvaliacao: 4.5,
          });
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    avaliacao: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _avg: { nota: 4.5 } }),
    },
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(criarPipeValidacao());
    app.useGlobalFilters(new ExcecaoPrismaFilter());

    jwtService = modulo.get(JwtService);
    tokenAutor = jwtService.sign({ sub: AUTOR.id, email: AUTOR.email, ver: AUTOR.versaoSessao });
    tokenOutro = jwtService.sign({
      sub: OUTRO_USUARIO.id,
      email: OUTRO_USUARIO.email,
      ver: OUTRO_USUARIO.versaoSessao,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------- GET /api/atividades/:id/avaliacoes ----------------------

  describe('GET /api/atividades/:atividadeId/avaliacoes', () => {
    it('deve listar avaliacoes publicamente para visitantes sem exigir token', async () => {
      prismaMock.avaliacao.findMany.mockResolvedValue([
        {
          id: 1,
          usuarioId: AUTOR.id,
          catalogoAtividadeId: 10,
          nota: 5,
          comentario: 'Incrível!',
          criadoEm: new Date(),
          usuario: { id: AUTOR.id, nome: AUTOR.nome },
        },
      ]);

      const resposta = await request(app.getHttpServer())
        .get('/api/atividades/10/avaliacoes')
        .expect(200);

      expect(resposta.body).toHaveLength(1);
      expect(resposta.body[0].nota).toBe(5);
      expect(resposta.body[0].usuario.nome).toBe(AUTOR.nome);
      expect(resposta.body[0].usuario.email).toBeUndefined(); // Protecao de dados (RNF03)
    });

    it('deve responder 404 quando a atividade nao existir no catalogo', async () => {
      await request(app.getHttpServer()).get('/api/atividades/999/avaliacoes').expect(404);
    });
  });

  // ---------------------- POST /api/atividades/:id/avaliacoes ----------------------

  describe('POST /api/atividades/:atividadeId/avaliacoes', () => {
    it('deve rejeitar avaliacao sem token com 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post('/api/atividades/10/avaliacoes')
        .send({ nota: 5 })
        .expect(401);
    });

    it('deve criar ou atualizar avaliacao com 201 Created quando autenticado', async () => {
      prismaMock.avaliacao.upsert.mockResolvedValue({
        id: 1,
        usuarioId: AUTOR.id,
        catalogoAtividadeId: 10,
        nota: 5,
        comentario: 'Muito bom!',
        criadoEm: new Date(),
        usuario: { id: AUTOR.id, nome: AUTOR.nome },
      });

      const resposta = await request(app.getHttpServer())
        .post('/api/atividades/10/avaliacoes')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .send({ nota: 5, comentario: 'Muito bom!' })
        .expect(201);

      expect(resposta.body).toMatchObject({
        id: 1,
        nota: 5,
        comentario: 'Muito bom!',
        usuario: { id: AUTOR.id, nome: AUTOR.nome },
      });
      expect(prismaMock.catalogoAtividade.update).toHaveBeenCalled();
    });

    it('deve rejeitar nota menor que 1 com 400 Bad Request', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/atividades/10/avaliacoes')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .send({ nota: 0 })
        .expect(400);

      expect(resposta.body.message).toContain('A nota deve ser de 1 a 5');
    });

    it('deve rejeitar nota maior que 5 com 400 Bad Request', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/atividades/10/avaliacoes')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .send({ nota: 6 })
        .expect(400);

      expect(resposta.body.message).toContain('A nota deve ser de 1 a 5');
    });

    it('deve responder 404 quando tentar avaliar atividade inexistente', async () => {
      await request(app.getHttpServer())
        .post('/api/atividades/999/avaliacoes')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .send({ nota: 4 })
        .expect(404);
    });
  });

  // ---------------------- DELETE /api/avaliacoes/:id ----------------------

  describe('DELETE /api/avaliacoes/:avaliacaoId', () => {
    it('deve rejeitar exclusao sem token com 401 Unauthorized', async () => {
      await request(app.getHttpServer()).delete('/api/avaliacoes/1').expect(401);
    });

    it('deve responder 403 Forbidden quando outro usuario tentar remover a avaliacao', async () => {
      prismaMock.avaliacao.findUnique.mockResolvedValue({
        id: 1,
        usuarioId: AUTOR.id,
        catalogoAtividadeId: 10,
      });

      await request(app.getHttpServer())
        .delete('/api/avaliacoes/1')
        .set('Authorization', `Bearer ${tokenOutro}`)
        .expect(403);

      expect(prismaMock.avaliacao.delete).not.toHaveBeenCalled();
    });

    it('deve responder 404 quando a avaliacao nao for encontrada', async () => {
      prismaMock.avaliacao.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/avaliacoes/999')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .expect(404);
    });

    it('deve remover a avaliacao com 204 No Content quando o autor solicita', async () => {
      prismaMock.avaliacao.findUnique.mockResolvedValue({
        id: 1,
        usuarioId: AUTOR.id,
        catalogoAtividadeId: 10,
      });
      prismaMock.avaliacao.delete.mockResolvedValue({ id: 1 });

      await request(app.getHttpServer())
        .delete('/api/avaliacoes/1')
        .set('Authorization', `Bearer ${tokenAutor}`)
        .expect(204);

      expect(prismaMock.avaliacao.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prismaMock.catalogoAtividade.update).toHaveBeenCalled();
    });
  });
});
