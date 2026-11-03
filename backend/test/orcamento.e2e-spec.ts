import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PermissaoMembro, Prisma, TipoAtividade } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExcecaoPrismaFilter } from '../src/common/filters/excecao-prisma.filter';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Orcamento da viagem passando por controller,
 * pipe de validacao e AcessoViagemGuard. Usa o Prisma mockado: nao exige PostgreSQL.
 */
describe('Modulo de Orcamento (e2e)', () => {
  const CRIADOR = { id: 1, email: 'ana@example.com' };
  const EDITOR = { id: 2, email: 'bruno@example.com' };
  const VISUALIZADOR = { id: 3, email: 'carla@example.com' };
  const ESTRANHO = { id: 4, email: 'diego@example.com' };

  const VIAGEM = 'EURO2027';
  const ROTA = `/api/viagens/${VIAGEM}/orcamento`;

  let app: INestApplication;
  let jwtService: JwtService;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: { findUnique: jest.fn() },
    viagem: { findUnique: jest.fn() },
    destinoViagem: { findUnique: jest.fn(), delete: jest.fn() },
    atividadeViagem: { aggregate: jest.fn(), findMany: jest.fn() },
    orcamento: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  /** Autentica o usuario e o coloca na viagem com o vinculo que ele tem nela. */
  function comoUsuario(usuario: { id: number; email: string }) {
    const permissao =
      usuario.id === EDITOR.id
        ? PermissaoMembro.EDITOR
        : usuario.id === VISUALIZADOR.id
          ? PermissaoMembro.VISUALIZADOR
          : undefined;

    prismaMock.usuario.findUnique.mockResolvedValue({ ...usuario, versaoSessao: 0 });
    prismaMock.viagem.findUnique.mockResolvedValue({
      id: VIAGEM,
      criadoPor: CRIADOR.id,
      membros: permissao ? [{ permissao }] : [],
    });

    const token = jwtService.sign({ sub: usuario.id, email: usuario.email, ver: 0 });
    return { Authorization: `Bearer ${token}` };
  }

  const http = () => request(app.getHttpServer());

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
      _sum: { custoPrevisto: new Prisma.Decimal('8400') },
    });
    prismaMock.orcamento.upsert.mockImplementation(({ create }) =>
      Promise.resolve({ id: 1, ...create, valorTotal: new Prisma.Decimal(create.valorTotal) }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('acesso', () => {
    it('exige token', () => http().get(ROTA).expect(401));

    it('esconde a viagem de quem nao participa dela (404)', async () => {
      await http().get(`${ROTA}/resumo`).set(comoUsuario(ESTRANHO)).expect(404);
      await http().put(ROTA).set(comoUsuario(ESTRANHO)).send({ valorTotal: 1000 }).expect(404);

      expect(prismaMock.orcamento.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.orcamento.upsert).not.toHaveBeenCalled();
    });

    it('o VISUALIZADOR consulta, mas nao define nem remove o orcamento', async () => {
      prismaMock.orcamento.findUnique.mockResolvedValue(null);
      prismaMock.atividadeViagem.findMany.mockResolvedValue([]);

      await http().get(`${ROTA}/resumo`).set(comoUsuario(VISUALIZADOR)).expect(200);

      const { body } = await http()
        .put(ROTA)
        .set(comoUsuario(VISUALIZADOR))
        .send({ valorTotal: 1000 })
        .expect(403);
      await http().delete(ROTA).set(comoUsuario(VISUALIZADOR)).expect(403);

      expect(body.message).toBe('Seu nivel de permissao nesta viagem e somente leitura');
      expect(prismaMock.orcamento.upsert).not.toHaveBeenCalled();
      expect(prismaMock.orcamento.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('PUT /orcamento', () => {
    it('o EDITOR define o total, que volta junto com o previsto das atividades', async () => {
      const { body } = await http()
        .put(ROTA)
        .set(comoUsuario(EDITOR))
        .send({ valorTotal: 12000.5 })
        .expect(200);

      // Decimal chega como string, conforme a descricao da API.
      expect(body).toEqual({
        id: 1,
        viagemId: VIAGEM,
        valorTotal: '12000.5',
        previstoAtividades: '8400',
      });
    });

    it('recusa orcamento zerado com mensagem em portugues', async () => {
      const { body } = await http()
        .put(ROTA)
        .set(comoUsuario(CRIADOR))
        .send({ valorTotal: 0 })
        .expect(400);

      expect(body.message).toEqual(['O orcamento total deve ser maior que zero']);
      expect(prismaMock.orcamento.upsert).not.toHaveBeenCalled();
    });

    it('recusa valor que nao cabe no banco com 400, e nao 500', async () => {
      const { body } = await http()
        .put(ROTA)
        .set(comoUsuario(CRIADOR))
        .send({ valorTotal: 1e9 })
        .expect(400);

      expect(body.message).toEqual(['O orcamento total deve ser de no maximo 99999999.99']);
    });
  });

  describe('GET /orcamento', () => {
    it('responde 404 com a explicacao enquanto nao ha orcamento', async () => {
      prismaMock.orcamento.findUnique.mockResolvedValue(null);

      const { body } = await http().get(ROTA).set(comoUsuario(CRIADOR)).expect(404);

      expect(body.message).toBe('Esta viagem ainda nao tem orcamento definido');
    });
  });

  describe('GET /orcamento/resumo', () => {
    it('monta o painel com saldo e percentual por categoria', async () => {
      prismaMock.orcamento.findUnique.mockResolvedValue({
        id: 1,
        viagemId: VIAGEM,
        valorTotal: new Prisma.Decimal('12000'),
        previstoAtividades: new Prisma.Decimal('8400'),
      });
      prismaMock.atividadeViagem.findMany.mockResolvedValue([
        {
          custoPrevisto: new Prisma.Decimal('5200'),
          catalogoAtividade: { tipoAtividade: TipoAtividade.HOSPEDAGEM },
        },
        {
          custoPrevisto: new Prisma.Decimal('3200'),
          catalogoAtividade: { tipoAtividade: TipoAtividade.PASSEIO },
        },
      ]);

      const { body } = await http().get(`${ROTA}/resumo`).set(comoUsuario(CRIADOR)).expect(200);

      expect(body).toEqual({
        orcamentoDefinido: true,
        orcamentoTotal: 12000,
        totalPlanejado: 8400,
        saldoDisponivel: 3600,
        percentualConsumido: 70,
        porCategoria: [
          { tipoAtividade: 'HOSPEDAGEM', total: 5200, percentual: 43.33 },
          { tipoAtividade: 'PASSEIO', total: 3200, percentual: 26.67 },
        ],
      });
    });
  });

  describe('DELETE /orcamento', () => {
    it('o EDITOR remove o orcamento (204)', async () => {
      prismaMock.orcamento.deleteMany.mockResolvedValue({ count: 1 });

      await http().delete(ROTA).set(comoUsuario(EDITOR)).expect(204);

      expect(prismaMock.orcamento.deleteMany).toHaveBeenCalledWith({
        where: { viagemId: VIAGEM },
      });
    });

    it('responde 404 se a viagem nao tinha orcamento', async () => {
      prismaMock.orcamento.deleteMany.mockResolvedValue({ count: 0 });

      await http().delete(ROTA).set(comoUsuario(CRIADOR)).expect(404);
    });
  });

  describe('previsto das atividades', () => {
    it('remover um destino recalcula o previsto, ja que as atividades dele somem junto', async () => {
      prismaMock.destinoViagem.findUnique.mockResolvedValue({ viagemId: VIAGEM });
      prismaMock.destinoViagem.delete.mockResolvedValue({});
      prismaMock.atividadeViagem.aggregate.mockResolvedValue({ _sum: { custoPrevisto: null } });
      prismaMock.orcamento.updateMany.mockResolvedValue({ count: 1 });

      await http().delete(`/api/viagens/${VIAGEM}/destinos/7`).set(comoUsuario(EDITOR)).expect(204);

      expect(prismaMock.destinoViagem.delete).toHaveBeenCalledWith({ where: { id: 7 } });
      const { where, data } = prismaMock.orcamento.updateMany.mock.calls[0][0];
      expect(where).toEqual({ viagemId: VIAGEM });
      expect(data.previstoAtividades.toString()).toBe('0');
    });
  });
});
