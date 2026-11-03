import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PermissaoMembro, Prisma, StatusAtividade, TipoAtividade } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExcecaoPrismaFilter } from '../src/common/filters/excecao-prisma.filter';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testes de ponta a ponta (e2e) do Modulo 4 - Atividades (RF12, RF13, RF14, RF16, RN01 a RN03 e RN06).
 * Exercita os controllers, DTOs, pipes de validacao, guards de autenticacao e controle de acesso por viagem
 * usando o Prisma mockado (nao exige PostgreSQL em execucao).
 */
describe('Modulo de Atividades (e2e)', () => {
  const CRIADOR = { id: 1, nome: 'Ana Criadora', email: 'ana@example.com' };
  const EDITOR = { id: 2, nome: 'Bruno Editor', email: 'bruno@example.com' };
  const VISUALIZADOR = { id: 3, nome: 'Carla Visualizadora', email: 'carla@example.com' };
  const ESTRANHO = { id: 4, nome: 'Diego Externo', email: 'diego@example.com' };

  let app: INestApplication;
  let jwtService: JwtService;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    usuario: { findUnique: jest.fn() },
    viagem: { findUnique: jest.fn() },
    destinoViagem: { findUnique: jest.fn() },
    catalogoAtividade: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    atividadeViagem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    orcamento: {
      updateMany: jest.fn(),
    },
  };

  /** Emite token JWT valido e configura o mock do usuario autenticado. */
  function autenticarComo(usuario: { id: number; nome: string; email: string }): string {
    prismaMock.usuario.findUnique.mockResolvedValue({ ...usuario, versaoSessao: 0 });
    return jwtService.sign({ sub: usuario.id, email: usuario.email, ver: 0 });
  }

  /** Configura a permissao do usuario consultado pelo AcessoViagemGuard na viagem EURO2027. */
  function configurarAcessoViagem(usuarioId: number) {
    const membros =
      usuarioId === EDITOR.id
        ? [{ permissao: PermissaoMembro.EDITOR }]
        : usuarioId === VISUALIZADOR.id
          ? [{ permissao: PermissaoMembro.VISUALIZADOR }]
          : [];

    prismaMock.viagem.findUnique.mockResolvedValue({
      id: 'EURO2027',
      criadoPor: CRIADOR.id,
      membros,
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
    app.useGlobalFilters(new ExcecaoPrismaFilter());

    jwtService = modulo.get(JwtService);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.atividadeViagem.aggregate.mockResolvedValue({
      _sum: { custoPrevisto: new Prisma.Decimal(250.5) },
    });
    prismaMock.orcamento.updateMany.mockResolvedValue({ count: 1 });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------- Catalogo de Atividades ----------------------

  describe('Catalogo de Atividades (/api/atividades)', () => {
    it('GET /api/atividades e publico para visitantes (RN01, RF24)', async () => {
      prismaMock.catalogoAtividade.findMany.mockResolvedValue([]);
      prismaMock.catalogoAtividade.count.mockResolvedValue(0);

      const { body } = await request(app.getHttpServer())
        .get('/api/atividades?tipoAtividade=PASSEIO&notaMinima=4')
        .expect(200);

      expect(body.total).toBe(0);
      expect(body.itens).toEqual([]);
    });

    it('POST /api/atividades exige autenticacao (401)', () => {
      return request(app.getHttpServer())
        .post('/api/atividades')
        .send({ nome: 'Torre de Belem', tipoAtividade: 'PASSEIO' })
        .expect(401);
    });

    it('POST /api/atividades cadastra atividade com foto, nome, tipo e local (201 - RF12, RF13)', async () => {
      const token = autenticarComo(CRIADOR);
      prismaMock.catalogoAtividade.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 10, mediaAvaliacao: 0, fonte: 'google_places', ...data }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/api/atividades')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nome: '  Jantar no Time Out Market  ',
          tipoAtividade: TipoAtividade.REFEICAO,
          local: 'Av. 24 de Julho',
          cidade: 'Lisboa',
          pais: 'Portugal',
          fotoUrl: 'https://exemplo.com/timeout.jpg',
        })
        .expect(201);

      expect(body).toMatchObject({
        id: 10,
        nome: 'Jantar no Time Out Market',
        tipoAtividade: 'REFEICAO',
        local: 'Av. 24 de Julho',
        fotoUrl: 'https://exemplo.com/timeout.jpg',
      });
    });

    it('POST /api/atividades retorna mensagens de validacao em portugues para payload invalido (400)', async () => {
      const token = autenticarComo(CRIADOR);

      const { body } = await request(app.getHttpServer())
        .post('/api/atividades')
        .set('Authorization', `Bearer ${token}`)
        .send({
          nome: '',
          tipoAtividade: 'CATEGORIA_INEXISTENTE',
          fotoUrl: 'nao-e-url',
        })
        .expect(400);

      expect(body.message).toEqual(
        expect.arrayContaining([
          'O nome da atividade nao pode ficar em branco',
          'Tipo de atividade invalido. Valores permitidos: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
          'Informe uma URL valida para a foto',
        ]),
      );
    });
  });

  // ------------------- Atividades dentro da Viagem -------------------

  describe('Atividades da Viagem (/api/viagens/:viagemId/atividades)', () => {
    it('POST .../atividades permite ao EDITOR agendar atividade no destino (201 - RF12, RF13, RF16, RN02)', async () => {
      const token = autenticarComo(EDITOR);
      configurarAcessoViagem(EDITOR.id);
      prismaMock.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prismaMock.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });
      prismaMock.atividadeViagem.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 50,
          ...data,
          custoPrevisto: String(data.custoPrevisto),
          catalogoAtividade: {
            id: 10,
            nome: 'Jantar no Time Out Market',
            tipoAtividade: TipoAtividade.REFEICAO,
            local: 'Av. 24 de Julho',
            fotoUrl: 'https://exemplo.com/timeout.jpg',
          },
        }),
      );

      const { body } = await request(app.getHttpServer())
        .post('/api/viagens/EURO2027/atividades')
        .set('Authorization', `Bearer ${token}`)
        .send({
          destinoViagemId: 3,
          catalogoAtividadeId: 10,
          dataHorario: '2027-01-12T20:00:00.000Z',
          duracaoMin: 90,
          custoPrevisto: 250.5,
          status: StatusAtividade.PENDENTE,
        })
        .expect(201);

      expect(body).toMatchObject({
        id: 50,
        destinoViagemId: 3,
        catalogoAtividadeId: 10,
        duracaoMin: 90,
        custoPrevisto: '250.5',
        status: 'PENDENTE',
      });
      expect(prismaMock.orcamento.updateMany).toHaveBeenCalled();
    });

    it('POST .../atividades bloqueia colaborador VISUALIZADOR (403 - RN03)', async () => {
      const token = autenticarComo(VISUALIZADOR);
      configurarAcessoViagem(VISUALIZADOR.id);

      await request(app.getHttpServer())
        .post('/api/viagens/EURO2027/atividades')
        .set('Authorization', `Bearer ${token}`)
        .send({ destinoViagemId: 3, catalogoAtividadeId: 10 })
        .expect(403);
    });

    it('GET .../atividades lista atividades em ordem cronologica por destino para membros (200 - RF14)', async () => {
      const token = autenticarComo(VISUALIZADOR);
      configurarAcessoViagem(VISUALIZADOR.id);
      prismaMock.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prismaMock.atividadeViagem.findMany.mockResolvedValue([
        {
          id: 50,
          destinoViagemId: 3,
          catalogoAtividadeId: 10,
          dataHorario: '2027-01-12T10:00:00.000Z',
          duracaoMin: 60,
          custoPrevisto: '100.00',
          status: StatusAtividade.CONFIRMADA,
          catalogoAtividade: { id: 10, nome: 'Torre de Belem', tipoAtividade: 'PASSEIO' },
          destinoViagem: { id: 3, ordem: 0, destinoCatalogo: { id: 1, nome: 'Lisboa' } },
        },
        {
          id: 51,
          destinoViagemId: 3,
          catalogoAtividadeId: 11,
          dataHorario: '2027-01-12T20:00:00.000Z',
          duracaoMin: 90,
          custoPrevisto: '250.50',
          status: StatusAtividade.PENDENTE,
          catalogoAtividade: { id: 11, nome: 'Time Out Market', tipoAtividade: 'REFEICAO' },
          destinoViagem: { id: 3, ordem: 0, destinoCatalogo: { id: 1, nome: 'Lisboa' } },
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/api/viagens/EURO2027/atividades?destinoViagemId=3')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(body).toHaveLength(2);
      expect(body[0].catalogoAtividade.nome).toBe('Torre de Belem');
      expect(body[1].catalogoAtividade.nome).toBe('Time Out Market');
    });

    it('GET .../atividades responde 404 para usuario que nao participa da viagem (RN06)', async () => {
      const token = autenticarComo(ESTRANHO);
      configurarAcessoViagem(ESTRANHO.id);

      await request(app.getHttpServer())
        .get('/api/viagens/EURO2027/atividades')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('PATCH .../atividades/:atividadeId atualiza horario, custo e status (200 - RF13, RF16)', async () => {
      const token = autenticarComo(CRIADOR);
      configurarAcessoViagem(CRIADOR.id);
      prismaMock.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'EURO2027' },
      });
      prismaMock.atividadeViagem.update.mockResolvedValue({
        id: 50,
        destinoViagemId: 3,
        catalogoAtividadeId: 10,
        duracaoMin: 120,
        custoPrevisto: '300',
        status: StatusAtividade.CONCLUIDA,
      });

      const { body } = await request(app.getHttpServer())
        .patch('/api/viagens/EURO2027/atividades/50')
        .set('Authorization', `Bearer ${token}`)
        .send({
          duracaoMin: 120,
          custoPrevisto: 300,
          status: StatusAtividade.CONCLUIDA,
        })
        .expect(200);

      expect(body.status).toBe('CONCLUIDA');
      expect(body.custoPrevisto).toBe('300');
      expect(prismaMock.orcamento.updateMany).toHaveBeenCalled();
    });

    it('DELETE .../atividades/:atividadeId remove a atividade e recalcula o orcamento (204 - RN02, RF16)', async () => {
      const token = autenticarComo(EDITOR);
      configurarAcessoViagem(EDITOR.id);
      prismaMock.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'EURO2027' },
      });
      prismaMock.atividadeViagem.delete.mockResolvedValue({ id: 50 });

      await request(app.getHttpServer())
        .delete('/api/viagens/EURO2027/atividades/50')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);

      expect(prismaMock.atividadeViagem.delete).toHaveBeenCalledWith({ where: { id: 50 } });
      expect(prismaMock.orcamento.updateMany).toHaveBeenCalled();
    });
  });
});
