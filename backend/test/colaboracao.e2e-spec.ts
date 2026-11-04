import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { PermissaoMembro, Prisma, StatusAtividade, TipoAtividade } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExcecaoPrismaFilter } from '../src/common/filters/excecao-prisma.filter';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { configurarSwagger } from '../src/config/swagger';
import { NotificacoesService } from '../src/modules/notificacoes/notificacoes.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Testes E2E do Modulo 6 - Colaboracao e Notificacoes (RF18 a RF21, RN02 a RN04 e RN06).
 * Exercita convite por codigo, niveis de permissao (EDITOR e VISUALIZADOR),
 * alteracao/remocao de colaboradores, emissao e leitura de notificacoes in-app
 * e contrato Swagger, usando o Prisma mockado (nao exige PostgreSQL).
 */
describe('Modulo 6 - Colaboracao e Notificacoes (e2e)', () => {
  const CRIADOR = { id: 1, nome: 'Ana Criadora', email: 'ana@example.com' };
  const EDITOR = { id: 2, nome: 'Bruno Editor', email: 'bruno@example.com' };
  const VISUALIZADOR = { id: 3, nome: 'Carla Visualizadora', email: 'carla@example.com' };
  const NOVO_USUARIO = { id: 4, nome: 'Diego Convidado', email: 'diego@example.com' };
  const ESTRANHO = { id: 5, nome: 'Elena Externa', email: 'elena@example.com' };

  const VIAGEM = 'DEMO2027';
  const ROTA_MEMBROS = `/api/viagens/${VIAGEM}/membros`;

  let app: INestApplication;
  let jwtService: JwtService;
  let notificacoesService: NotificacoesService;

  const prismaMock = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: { findUnique: jest.fn() },
    viagem: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    membroViagem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    destinoViagem: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    catalogoAtividade: {
      findUnique: jest.fn(),
    },
    atividadeViagem: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    orcamento: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  function comoUsuario(usuario: { id: number; nome: string; email: string }) {
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
    configurarSwagger(app, 'api');

    jwtService = modulo.get(JwtService);
    notificacoesService = modulo.get(NotificacoesService);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    notificacoesService.limpar();

    prismaMock.membroViagem.findMany.mockResolvedValue([
      { usuarioId: EDITOR.id, viagem: { criadoPor: CRIADOR.id } },
      { usuarioId: VISUALIZADOR.id, viagem: { criadoPor: CRIADOR.id } },
    ]);
    prismaMock.atividadeViagem.aggregate.mockResolvedValue({
      _sum: { custoPrevisto: new Prisma.Decimal('200') },
    });
    prismaMock.orcamento.updateMany.mockResolvedValue({ count: 1 });
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------- Convite pelo codigo (RF18) ----------------------

  describe('POST /api/viagens/:viagemId/membros/entrar - convite pelo codigo', () => {
    it('exige autenticacao (401)', () => http().post(`${ROTA_MEMBROS}/entrar`).expect(401));

    it('permite que usuario convidado entre pelo codigo comecando como VISUALIZADOR (201)', async () => {
      const cabecalho = comoUsuario(NOVO_USUARIO);
      prismaMock.viagem.findUnique.mockResolvedValue({ id: VIAGEM, criadoPor: CRIADOR.id });
      prismaMock.membroViagem.findUnique.mockResolvedValue(null);
      prismaMock.membroViagem.create.mockResolvedValue({
        id: 15,
        viagemId: VIAGEM,
        usuarioId: NOVO_USUARIO.id,
        permissao: PermissaoMembro.VISUALIZADOR,
        entrouEm: new Date('2026-10-10T12:00:00.000Z'),
        usuario: NOVO_USUARIO,
      });

      const { body } = await http().post(`${ROTA_MEMBROS}/entrar`).set(cabecalho).expect(201);

      expect(body).toMatchObject({
        id: 15,
        viagemId: VIAGEM,
        usuarioId: NOVO_USUARIO.id,
        permissao: 'VISUALIZADOR',
        usuario: { id: NOVO_USUARIO.id, nome: NOVO_USUARIO.nome, email: NOVO_USUARIO.email },
      });
    });

    it('responde 404 quando o codigo da viagem nao existe', async () => {
      const cabecalho = comoUsuario(NOVO_USUARIO);
      prismaMock.viagem.findUnique.mockResolvedValue(null);

      const { body } = await http()
        .post('/api/viagens/NAOEXIST/membros/entrar')
        .set(cabecalho)
        .expect(404);

      expect(body.message).toBe('Codigo de convite invalido');
    });

    it('responde 409 quando o proprio criador tenta entrar como colaborador', async () => {
      const cabecalho = comoUsuario(CRIADOR);

      const { body } = await http().post(`${ROTA_MEMBROS}/entrar`).set(cabecalho).expect(409);

      expect(body.message).toBe('Voce e o criador desta viagem');
    });

    it('responde 409 quando o usuario ja participa da viagem', async () => {
      const cabecalho = comoUsuario(VISUALIZADOR);
      prismaMock.membroViagem.findUnique.mockResolvedValue({ id: 12 });

      const { body } = await http().post(`${ROTA_MEMBROS}/entrar`).set(cabecalho).expect(409);

      expect(body.message).toBe('Voce ja participa desta viagem');
    });
  });

  // --------- Listagem e Niveis de Permissao (RF19, RN02, RN03, RN06) ---------

  describe('GET /api/viagens/:viagemId/membros e niveis de permissao', () => {
    it('lista os colaboradores para qualquer membro da viagem (200)', async () => {
      const cabecalho = comoUsuario(VISUALIZADOR);
      prismaMock.membroViagem.findMany.mockResolvedValueOnce([
        {
          id: 11,
          viagemId: VIAGEM,
          usuarioId: EDITOR.id,
          permissao: PermissaoMembro.EDITOR,
          entrouEm: new Date('2026-10-01T10:00:00.000Z'),
          usuario: EDITOR,
        },
        {
          id: 12,
          viagemId: VIAGEM,
          usuarioId: VISUALIZADOR.id,
          permissao: PermissaoMembro.VISUALIZADOR,
          entrouEm: new Date('2026-10-02T10:00:00.000Z'),
          usuario: VISUALIZADOR,
        },
      ]);

      const { body } = await http().get(ROTA_MEMBROS).set(cabecalho).expect(200);

      expect(body).toHaveLength(2);
      expect(body[0].permissao).toBe('EDITOR');
      expect(body[1].permissao).toBe('VISUALIZADOR');
    });

    it('esconde a viagem de quem nao participa dela (404)', async () => {
      const cabecalho = comoUsuario(ESTRANHO);

      const { body } = await http().get(ROTA_MEMBROS).set(cabecalho).expect(404);

      expect(body.message).toBe(`Viagem ${VIAGEM} nao encontrada`);
    });

    it('permite ao EDITOR adicionar destinos, atividades e orcamento, mas bloqueia VISUALIZADOR (403)', async () => {
      // VISUALIZADOR bloqueado em destinos, atividades e orcamento
      await http()
        .post(`/api/viagens/${VIAGEM}/destinos`)
        .set(comoUsuario(VISUALIZADOR))
        .send({ destinoCatalogoId: 1 })
        .expect(403);

      await http()
        .post(`/api/viagens/${VIAGEM}/atividades`)
        .set(comoUsuario(VISUALIZADOR))
        .send({ destinoViagemId: 10, catalogoAtividadeId: 20 })
        .expect(403);

      await http()
        .put(`/api/viagens/${VIAGEM}/orcamento`)
        .set(comoUsuario(VISUALIZADOR))
        .send({ valorTotal: 3000 })
        .expect(403);

      // EDITOR autorizado em destinos, atividades e orcamento
      prismaMock.destinoViagem.findFirst.mockResolvedValue({ ordem: 0 });
      prismaMock.destinoViagem.create.mockResolvedValue({
        id: 10,
        viagemId: VIAGEM,
        destinoCatalogoId: 1,
        ordem: 1,
        destinoCatalogo: { id: 1, nome: 'Lisboa' },
      });

      await http()
        .post(`/api/viagens/${VIAGEM}/destinos`)
        .set(comoUsuario(EDITOR))
        .send({ destinoCatalogoId: 1 })
        .expect(201);

      prismaMock.destinoViagem.findUnique.mockResolvedValue({ viagemId: VIAGEM });
      prismaMock.catalogoAtividade.findUnique.mockResolvedValue({ id: 20 });
      prismaMock.atividadeViagem.create.mockResolvedValue({
        id: 30,
        destinoViagemId: 10,
        catalogoAtividadeId: 20,
        status: StatusAtividade.PENDENTE,
        catalogoAtividade: {
          id: 20,
          nome: 'Torre de Belem',
          tipoAtividade: TipoAtividade.PASSEIO,
        },
      });

      await http()
        .post(`/api/viagens/${VIAGEM}/atividades`)
        .set(comoUsuario(EDITOR))
        .send({ destinoViagemId: 10, catalogoAtividadeId: 20 })
        .expect(201);

      prismaMock.orcamento.upsert.mockResolvedValue({
        id: 1,
        viagemId: VIAGEM,
        valorTotal: new Prisma.Decimal('3000'),
        previstoAtividades: new Prisma.Decimal('200'),
      });

      await http()
        .put(`/api/viagens/${VIAGEM}/orcamento`)
        .set(comoUsuario(EDITOR))
        .send({ valorTotal: 3000 })
        .expect(200);
    });
  });

  // --------- Alterar Permissao e Remover Colaboradores (RF20, RN04) ---------

  describe('PATCH e DELETE /api/viagens/:viagemId/membros - gestao de colaboradores', () => {
    it('permite ao criador alterar a permissao de um colaborador (200)', async () => {
      prismaMock.membroViagem.findUnique.mockResolvedValue({
        viagemId: VIAGEM,
        usuarioId: VISUALIZADOR.id,
      });
      prismaMock.membroViagem.update.mockResolvedValue({
        id: 12,
        viagemId: VIAGEM,
        usuarioId: VISUALIZADOR.id,
        permissao: PermissaoMembro.EDITOR,
        entrouEm: new Date('2026-10-02T10:00:00.000Z'),
        usuario: VISUALIZADOR,
      });

      const { body } = await http()
        .patch(`${ROTA_MEMBROS}/12`)
        .set(comoUsuario(CRIADOR))
        .send({ permissao: 'EDITOR' })
        .expect(200);

      expect(body.permissao).toBe('EDITOR');
    });

    it('rejeita permissao invalida no PATCH com mensagem em portugues (400)', async () => {
      const { body } = await http()
        .patch(`${ROTA_MEMBROS}/12`)
        .set(comoUsuario(CRIADOR))
        .send({ permissao: 'SUPER_ADMIN' })
        .expect(400);

      expect(body.message).toEqual(['Permissao invalida: use EDITOR ou VISUALIZADOR']);
    });

    it('impede que um colaborador EDITOR altere permissoes ou remova membros (403)', async () => {
      const alteracao = await http()
        .patch(`${ROTA_MEMBROS}/12`)
        .set(comoUsuario(EDITOR))
        .send({ permissao: 'EDITOR' })
        .expect(403);

      expect(alteracao.body.message).toBe('Apenas o criador da viagem pode executar esta acao');

      const remocao = await http()
        .delete(`${ROTA_MEMBROS}/12`)
        .set(comoUsuario(EDITOR))
        .expect(403);

      expect(remocao.body.message).toBe('Apenas o criador da viagem pode executar esta acao');
    });

    it('responde 404 quando o criador tenta alterar ou remover membro de outra viagem', async () => {
      prismaMock.membroViagem.findUnique.mockResolvedValue({
        viagemId: 'OUTRA999',
        usuarioId: 99,
      });

      const alteracao = await http()
        .patch(`${ROTA_MEMBROS}/99`)
        .set(comoUsuario(CRIADOR))
        .send({ permissao: 'EDITOR' })
        .expect(404);

      expect(alteracao.body.message).toBe('Colaborador nao encontrado nesta viagem');

      const remocao = await http()
        .delete(`${ROTA_MEMBROS}/99`)
        .set(comoUsuario(CRIADOR))
        .expect(404);

      expect(remocao.body.message).toBe('Colaborador nao encontrado nesta viagem');
    });

    it('permite ao criador remover um colaborador a qualquer momento (204)', async () => {
      prismaMock.membroViagem.findUnique.mockResolvedValue({
        viagemId: VIAGEM,
        usuarioId: VISUALIZADOR.id,
      });
      prismaMock.membroViagem.delete.mockResolvedValue({ id: 12 });

      await http().delete(`${ROTA_MEMBROS}/12`).set(comoUsuario(CRIADOR)).expect(204);

      expect(prismaMock.membroViagem.delete).toHaveBeenCalledWith({ where: { id: 12 } });
    });

    it('permite ao colaborador sair da viagem (204) e impede o criador de sair (400)', async () => {
      prismaMock.membroViagem.findUnique.mockResolvedValueOnce({
        id: 12,
        viagem: { criadoPor: CRIADOR.id },
      });
      prismaMock.membroViagem.delete.mockResolvedValueOnce({ id: 12 });

      await http().delete(`${ROTA_MEMBROS}/sair`).set(comoUsuario(VISUALIZADOR)).expect(204);

      prismaMock.membroViagem.findUnique.mockResolvedValueOnce(null);

      const { body } = await http()
        .delete(`${ROTA_MEMBROS}/sair`)
        .set(comoUsuario(CRIADOR))
        .expect(400);

      expect(body.message).toBe('O criador da viagem nao pode sair dela; exclua a viagem');
    });
  });

  // ---------------- Notificacoes In-App (RF21) ----------------

  describe('Notificacoes in-app (/api/notificacoes)', () => {
    it('exige autenticacao em todas as rotas de notificacoes (401)', async () => {
      await http().get('/api/notificacoes').expect(401);
      await http().patch('/api/notificacoes/lidas').expect(401);
      await http().patch('/api/notificacoes/1/lida').expect(401);
    });

    it('envia notificacoes in-app para colaboradores quando alteracoes relevantes sao feitas na viagem', async () => {
      // 1. O criador adiciona um destino na viagem -> EDITOR e VISUALIZADOR recebem notificacao
      prismaMock.destinoViagem.findFirst.mockResolvedValue({ ordem: 0 });
      prismaMock.destinoViagem.create.mockResolvedValue({
        id: 10,
        viagemId: VIAGEM,
        destinoCatalogoId: 1,
        ordem: 1,
        destinoCatalogo: { id: 1, nome: 'Lisboa' },
      });

      await http()
        .post(`/api/viagens/${VIAGEM}/destinos`)
        .set(comoUsuario(CRIADOR))
        .send({ destinoCatalogoId: 1 })
        .expect(201);

      // 2. O EDITOR atualiza as informacoes da viagem -> CRIADOR e VISUALIZADOR recebem notificacao
      prismaMock.viagem.findUniqueOrThrow.mockResolvedValue({ dataInicio: null, dataFim: null });
      prismaMock.viagem.update.mockResolvedValue({
        id: VIAGEM,
        nome: 'Eurotrip 2027 - Confirmada',
      });

      await http()
        .patch(`/api/viagens/${VIAGEM}`)
        .set(comoUsuario(EDITOR))
        .send({ nome: 'Eurotrip 2027 - Confirmada' })
        .expect(200);

      // O VISUALIZADOR recebeu as duas notificacoes (mais recente primeiro)
      const listaVisualizador = await http()
        .get('/api/notificacoes')
        .set(comoUsuario(VISUALIZADOR))
        .expect(200);

      expect(listaVisualizador.body.total).toBe(2);
      expect(listaVisualizador.body.itens[0]).toMatchObject({
        viagemId: VIAGEM,
        tipo: 'VIAGEM_ATUALIZADA',
        mensagem: 'As informacoes da viagem Eurotrip 2027 - Confirmada foram atualizadas',
        lida: false,
      });
      expect(listaVisualizador.body.itens[1]).toMatchObject({
        viagemId: VIAGEM,
        tipo: 'DESTINO_ADICIONADO',
        mensagem: 'Destino Lisboa adicionado ao roteiro da viagem',
        lida: false,
      });

      // O EDITOR tambem visualiza o historico das duas alteracoes na viagem
      const listaEditor = await http()
        .get('/api/notificacoes')
        .set(comoUsuario(EDITOR))
        .expect(200);

      expect(listaEditor.body.total).toBe(2);
      expect(listaEditor.body.itens[0].tipo).toBe('VIAGEM_ATUALIZADA');
      expect(listaEditor.body.itens[1].tipo).toBe('DESTINO_ADICIONADO');
    });

    it('marca notificacao individual e todas como lidas, filtrando por apenasNaoLidas', async () => {
      notificacoesService.registrarParaUsuarios([VISUALIZADOR.id], {
        viagemId: VIAGEM,
        tipo: 'ATIVIDADE_ADICIONADA',
        mensagem: 'Atividade Torre de Belem adicionada ao roteiro da viagem',
      });
      notificacoesService.registrarParaUsuarios([VISUALIZADOR.id], {
        viagemId: VIAGEM,
        tipo: 'ORCAMENTO_ATUALIZADO',
        mensagem: 'Orcamento da viagem definido em 5000',
      });

      const inicial = await http()
        .get('/api/notificacoes?apenasNaoLidas=true')
        .set(comoUsuario(VISUALIZADOR))
        .expect(200);

      expect(inicial.body.total).toBe(2);
      const idPrimeira = inicial.body.itens[0].id as number;

      // Marca a primeira como lida
      const lida = await http()
        .patch(`/api/notificacoes/${idPrimeira}/lida`)
        .set(comoUsuario(VISUALIZADOR))
        .expect(200);

      expect(lida.body).toMatchObject({ id: idPrimeira, lida: true });

      // Outro usuario nao pode marcar a notificacao alheia (404)
      await http()
        .patch(`/api/notificacoes/${idPrimeira}/lida`)
        .set(comoUsuario(ESTRANHO))
        .expect(404);

      // Filtro apenasNaoLidas=true traz somente a restante
      const pendentes = await http()
        .get('/api/notificacoes?apenasNaoLidas=true')
        .set(comoUsuario(VISUALIZADOR))
        .expect(200);

      expect(pendentes.body.total).toBe(1);

      // Marca todas como lidas (204)
      await http().patch('/api/notificacoes/lidas').set(comoUsuario(VISUALIZADOR)).expect(204);

      const aposMarcarTodas = await http()
        .get('/api/notificacoes?apenasNaoLidas=true')
        .set(comoUsuario(VISUALIZADOR))
        .expect(200);

      expect(aposMarcarTodas.body.total).toBe(0);
    });
  });

  // ---------------- Contrato Swagger / OpenAPI ----------------

  describe('Documentacao Swagger do Modulo 6', () => {
    it('publica todas as rotas de Colaboracao e Notificacoes prontas para teste no Swagger', async () => {
      const { body } = await http().get('/api/docs-json').expect(200);
      const documento = body as OpenAPIObject;

      expect(Object.keys(documento.paths)).toEqual(
        expect.arrayContaining([
          '/api/viagens/{viagemId}/membros/entrar',
          '/api/viagens/{viagemId}/membros',
          '/api/viagens/{viagemId}/membros/{membroId}',
          '/api/viagens/{viagemId}/membros/sair',
          '/api/notificacoes',
          '/api/notificacoes/lidas',
          '/api/notificacoes/{notificacaoId}/lida',
        ]),
      );

      // Nenhuma rota de notificacoes deve ter resposta 501 (nao implementado)
      expect(documento.paths['/api/notificacoes'].get?.responses['501']).toBeUndefined();
      expect(documento.paths['/api/notificacoes/lidas'].patch?.responses['501']).toBeUndefined();
      expect(
        documento.paths['/api/notificacoes/{notificacaoId}/lida'].patch?.responses['501'],
      ).toBeUndefined();
    });
  });
});
