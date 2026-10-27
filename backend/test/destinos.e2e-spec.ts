import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { CategoriaDestino, PermissaoMembro } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Suite E2E do Modulo 3 - Destinos (RF08 a RF11).
 * Usa Prisma mockado para rodar sem banco no CI (`npm run test:e2e`).
 */
describe('Modulo 3 - Destinos e Paises Visitados (e2e)', () => {
  const CRIADOR = { id: 1, nome: 'Rafael Criador', email: 'rafael@example.com' };
  const VISUALIZADOR = { id: 2, nome: 'Visitante Membro', email: 'membro@example.com' };

  let app: INestApplication;
  let jwtService: JwtService;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    usuario: {
      findUnique: jest.fn(),
    },
    viagem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    destinoCatalogo: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    destinoViagem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  function tokenDe(usuario: { id: number; email: string }) {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...usuario, versaoSessao: 0 });
    return jwtService.sign({ sub: usuario.id, email: usuario.email, ver: 0 });
  }

  function configurarAcessoViagem(usuarioId: number) {
    prismaMock.viagem.findUnique.mockResolvedValue({
      id: 'DEMO2027',
      criadoPor: CRIADOR.id,
      membros: usuarioId === VISUALIZADOR.id ? [{ permissao: PermissaoMembro.VISUALIZADOR }] : [],
    });
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Catalogo de Destinos (RF09, RF10, RN01)', () => {
    it('GET /api/destinos permite pesquisa publica com filtros (RF10, RN01)', async () => {
      prismaMock.destinoCatalogo.findMany.mockResolvedValue([
        {
          id: 1,
          nome: 'Lisboa',
          pais: 'Portugal',
          categoria: CategoriaDestino.CIDADE,
          descricao: 'Capital portuguesa',
          latitude: 38.7223,
          longitude: -9.1393,
          fotoUrl: null,
        },
      ]);
      prismaMock.destinoCatalogo.count.mockResolvedValue(1);

      const resposta = await request(app.getHttpServer())
        .get('/api/destinos?busca=Lisboa&categoria=CIDADE&pais=Portugal')
        .expect(200);

      expect(resposta.body.total).toBe(1);
      expect(resposta.body.itens[0].nome).toBe('Lisboa');
    });

    it('GET /api/destinos/:id retorna 200 quando encontrado e 404 quando nao existe', async () => {
      prismaMock.destinoCatalogo.findUnique.mockResolvedValueOnce({
        id: 1,
        nome: 'Lisboa',
        pais: 'Portugal',
      });

      await request(app.getHttpServer()).get('/api/destinos/1').expect(200);

      prismaMock.destinoCatalogo.findUnique.mockResolvedValueOnce(null);
      await request(app.getHttpServer()).get('/api/destinos/999').expect(404);
    });

    it('POST /api/destinos cadastra novo destino no catalogo quando autenticado (RF09)', async () => {
      const token = tokenDe(CRIADOR);
      prismaMock.destinoCatalogo.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 5, ...data }),
      );

      const resposta = await request(app.getHttpServer())
        .post('/api/destinos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nome: 'Gramado',
          pais: 'Brasil',
          categoria: 'NATUREZA',
          descricao: 'Serra Gaucha',
          latitude: -29.3746,
          longitude: -50.8764,
          fotoUrl: 'https://exemplo.com/gramado.jpg',
        })
        .expect(201);

      expect(resposta.body).toMatchObject({
        id: 5,
        nome: 'Gramado',
        pais: 'Brasil',
        categoria: 'NATUREZA',
      });
    });
  });

  describe('Roteiro de Destinos na Viagem (RF08, RN02, RN03)', () => {
    it('GET /api/viagens/:viagemId/destinos lista destinos na ordem de visita', async () => {
      const token = tokenDe(CRIADOR);
      configurarAcessoViagem(CRIADOR.id);
      prismaMock.destinoViagem.findMany.mockResolvedValue([
        {
          id: 10,
          viagemId: 'DEMO2027',
          destinoCatalogoId: 1,
          ordem: 0,
          destinoCatalogo: { id: 1, nome: 'Lisboa' },
          _count: { atividades: 2 },
        },
      ]);

      const resposta = await request(app.getHttpServer())
        .get('/api/viagens/DEMO2027/destinos')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toHaveLength(1);
      expect(resposta.body[0].ordem).toBe(0);
    });

    it('POST /api/viagens/:viagemId/destinos adiciona destino e calcula a ordem', async () => {
      const token = tokenDe(CRIADOR);
      configurarAcessoViagem(CRIADOR.id);
      prismaMock.destinoViagem.findFirst.mockResolvedValue({ ordem: 1 });
      prismaMock.destinoViagem.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 11,
          ...data,
          destinoCatalogo: { id: data.destinoCatalogoId, nome: 'Porto' },
        }),
      );

      const resposta = await request(app.getHttpServer())
        .post('/api/viagens/DEMO2027/destinos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          destinoCatalogoId: 2,
          chegada: '2027-01-15',
          saida: '2027-01-18',
          descricao: 'Visita as caves de vinho',
        })
        .expect(201);

      expect(resposta.body.ordem).toBe(2);
    });

    it('POST /api/viagens/:viagemId/destinos rejeita saida anterior a chegada (400)', async () => {
      const token = tokenDe(CRIADOR);
      configurarAcessoViagem(CRIADOR.id);

      await request(app.getHttpServer())
        .post('/api/viagens/DEMO2027/destinos')
        .set('Authorization', `Bearer ${token}`)
        .send({
          destinoCatalogoId: 1,
          chegada: '2027-01-20',
          saida: '2027-01-10',
        })
        .expect(400);
    });

    it('POST /api/viagens/:viagemId/destinos bloqueia VISUALIZADOR com 403 (RN03)', async () => {
      const token = tokenDe(VISUALIZADOR);
      configurarAcessoViagem(VISUALIZADOR.id);

      await request(app.getHttpServer())
        .post('/api/viagens/DEMO2027/destinos')
        .set('Authorization', `Bearer ${token}`)
        .send({ destinoCatalogoId: 1 })
        .expect(403);
    });

    it('PATCH e DELETE /api/viagens/:viagemId/destinos/:destinoId editam e removem o destino', async () => {
      const token = tokenDe(CRIADOR);
      configurarAcessoViagem(CRIADOR.id);
      prismaMock.destinoViagem.findUnique.mockResolvedValue({
        viagemId: 'DEMO2027',
        chegada: new Date('2027-01-10'),
        saida: new Date('2027-01-15'),
      });
      prismaMock.destinoViagem.update.mockResolvedValue({
        id: 10,
        viagemId: 'DEMO2027',
        ordem: 1,
        descricao: 'Ordem alterada',
        destinoCatalogo: { id: 1, nome: 'Lisboa' },
      });

      await request(app.getHttpServer())
        .patch('/api/viagens/DEMO2027/destinos/10')
        .set('Authorization', `Bearer ${token}`)
        .send({ ordem: 1, descricao: 'Ordem alterada' })
        .expect(200);

      prismaMock.destinoViagem.delete.mockResolvedValue({ id: 10 });

      await request(app.getHttpServer())
        .delete('/api/viagens/DEMO2027/destinos/10')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
    });
  });

  describe('Mapa de Paises Visitados (RF11)', () => {
    it('GET /api/usuarios/eu/paises-visitados retorna os paises em ISO alfa-2 (200)', async () => {
      const token = tokenDe(CRIADOR);
      prismaMock.viagem.findMany.mockResolvedValue([
        {
          id: 'DEMO2027',
          destinos: [
            { destinoCatalogo: { pais: 'Portugal' } },
            { destinoCatalogo: { pais: 'Brasil' } },
          ],
        },
      ]);

      const resposta = await request(app.getHttpServer())
        .get('/api/usuarios/eu/paises-visitados')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(resposta.body).toEqual([
        { codigo: 'BR', nome: 'Brasil', viagens: 1 },
        { codigo: 'PT', nome: 'Portugal', viagens: 1 },
      ]);
    });
  });
});
