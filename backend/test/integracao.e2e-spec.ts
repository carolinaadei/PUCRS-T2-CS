import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExcecaoPrismaFilter } from '../src/common/filters/excecao-prisma.filter';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Percorre todos os endpoints contra um PostgreSQL de verdade, sem mock: e o
 * unico jeito de cobrir o que o Prisma so descobre no banco (chaves
 * estrangeiras, indices unicos, campos derivados e cascatas).
 *
 * Exige um banco dedicado, e nao o de desenvolvimento - as tabelas sao
 * truncadas entre os testes. Para rodar:
 *
 *   createdb viajajunto_test
 *   DATABASE_URL_TESTE=postgresql://user:senha@localhost:5432/viajajunto_test \
 *     npx prisma migrate deploy
 *   npm run test:integracao
 *
 * Sem a variavel a suite e ignorada, para `npm run test:e2e` seguir rodando
 * sem banco (inclusive no CI).
 */
const URL_TESTE = process.env.DATABASE_URL_TESTE;
const descreve = URL_TESTE ? describe : describe.skip;

const TABELAS = [
  'avaliacao',
  'atividade_viagem',
  'orcamento',
  'destino_viagem',
  'membro_viagem',
  'token_recuperacao_senha',
  'viagem',
  'catalogo_atividade',
  'destino_catalogo',
  'usuario',
];

descreve('Todos os endpoints contra o banco real (integracao)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  /** Tokens e ids compartilhados pela jornada, na ordem em que sao criados. */
  let tokenCriador: string;
  let tokenColaborador: string;
  let tokenEstranho: string;
  let idColaborador: number;
  let viagemId: string;
  let destinoCatalogoId: number;
  let destinoViagemId: number;
  let atividadeCatalogoId: number;
  let atividadeViagemId: number;
  let membroId: number;
  let avaliacaoId: number;

  const comToken = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_TESTE;

    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      // O rate limit e coberto no teste do RF03; aqui so atrapalharia.
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .compile();

    app = modulo.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(criarPipeValidacao());
    app.useGlobalFilters(new ExcecaoPrismaFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('Health', () => {
    it('GET /api/health responde sem token', async () => {
      const { body } = await http().get('/api/health').expect(200);
      expect(body.status).toBeDefined();
    });
  });

  describe('Autenticacao e perfil (RF01, RF02)', () => {
    it('POST /api/auth/registrar cria as tres contas da jornada', async () => {
      const criador = await http()
        .post('/api/auth/registrar')
        .send({ nome: 'Ana Criadora', email: 'ana@teste.com', senha: 'senhaSegura123' })
        .expect(201);

      const colaborador = await http()
        .post('/api/auth/registrar')
        .send({ nome: 'Bruno Colab', email: 'bruno@teste.com', senha: 'senhaSegura123' })
        .expect(201);

      const estranho = await http()
        .post('/api/auth/registrar')
        .send({ nome: 'Carla Estranha', email: 'carla@teste.com', senha: 'senhaSegura123' })
        .expect(201);

      tokenCriador = criador.body.accessToken;
      tokenColaborador = colaborador.body.accessToken;
      tokenEstranho = estranho.body.accessToken;
      idColaborador = colaborador.body.usuario.id;

      expect(tokenCriador).toEqual(expect.any(String));
      expect(JSON.stringify(criador.body)).not.toContain('senhaHash');
    });

    it('POST /api/auth/registrar rejeita e-mail repetido com 409', () =>
      http()
        .post('/api/auth/registrar')
        .send({ nome: 'Outra Ana', email: 'ana@teste.com', senha: 'senhaSegura123' })
        .expect(409));

    it('POST /api/auth/login autentica e o token abre as rotas protegidas', async () => {
      const { body } = await http()
        .post('/api/auth/login')
        .send({ email: 'ana@teste.com', senha: 'senhaSegura123' })
        .expect(200);

      await http().get('/api/usuarios/eu').set(comToken(body.accessToken)).expect(200);
    });

    it('GET /api/usuarios/eu devolve o perfil sem o hash da senha', async () => {
      const { body } = await http().get('/api/usuarios/eu').set(comToken(tokenCriador)).expect(200);

      expect(body.email).toBe('ana@teste.com');
      expect(body.senhaHash).toBeUndefined();
    });

    it('PATCH /api/usuarios/eu altera o nome', async () => {
      const { body } = await http()
        .patch('/api/usuarios/eu')
        .set(comToken(tokenCriador))
        .send({ nome: 'Ana Renomeada' })
        .expect(200);

      expect(body.nome).toBe('Ana Renomeada');
    });

    it('GET /api/usuarios/eu/paises-visitados ainda responde 501 (RF11)', () =>
      http().get('/api/usuarios/eu/paises-visitados').set(comToken(tokenCriador)).expect(501));
  });

  describe('Viagens (RF04 a RF07)', () => {
    it('POST /api/viagens cria a viagem e gera o codigo de convite', async () => {
      const { body } = await http()
        .post('/api/viagens')
        .set(comToken(tokenCriador))
        .send({
          nome: 'Eurotrip 2027',
          descricao: 'Roteiro de teste',
          dataInicio: '2027-01-10',
          dataFim: '2027-01-25',
        })
        .expect(201);

      viagemId = body.id;

      // O id e o proprio codigo de convite: 8 caracteres do alfabeto sem ambiguidade.
      expect(viagemId).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
      expect(body.status).toBe('EM_PLANEJAMENTO');
    });

    it('GET /api/viagens lista o painel pessoal paginado', async () => {
      const { body } = await http().get('/api/viagens').set(comToken(tokenCriador)).expect(200);

      expect(body.total).toBe(1);
      expect(body.itens[0].id).toBe(viagemId);
    });

    it('GET /api/viagens/:id devolve o detalhe ao criador', async () => {
      const { body } = await http()
        .get(`/api/viagens/${viagemId}`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body.criador.email).toBe('ana@teste.com');
      expect(body.membros).toEqual([]);
      expect(body.destinos).toEqual([]);
    });

    it('GET /api/viagens/:id responde 404 para quem nao participa (RN06)', () =>
      http().get(`/api/viagens/${viagemId}`).set(comToken(tokenEstranho)).expect(404));

    it('PATCH /api/viagens/:id edita nome e status', async () => {
      const { body } = await http()
        .patch(`/api/viagens/${viagemId}`)
        .set(comToken(tokenCriador))
        .send({ nome: 'Eurotrip 2027 - revisada', status: 'CONFIRMADA' })
        .expect(200);

      expect(body.nome).toBe('Eurotrip 2027 - revisada');
      expect(body.status).toBe('CONFIRMADA');
    });
  });

  describe('Destinos (RF08 a RF10)', () => {
    it('GET /api/destinos e publico para visitantes (RN01)', async () => {
      const { body } = await http().get('/api/destinos').expect(200);
      expect(body.total).toBe(0);
    });

    it('POST /api/destinos cadastra no catalogo', async () => {
      const { body } = await http()
        .post('/api/destinos')
        .set(comToken(tokenCriador))
        .send({
          nome: 'Lisboa',
          pais: 'Portugal',
          categoria: 'CIDADE',
          latitude: 38.7223,
          longitude: -9.1393,
        })
        .expect(201);

      destinoCatalogoId = body.id;
      expect(body.nome).toBe('Lisboa');
    });

    it('GET /api/destinos filtra por busca e categoria', async () => {
      const { body } = await http().get('/api/destinos?busca=lisb&categoria=CIDADE').expect(200);
      expect(body.total).toBe(1);
    });

    it('GET /api/destinos/:id devolve o destino do catalogo', () =>
      http().get(`/api/destinos/${destinoCatalogoId}`).expect(200));

    it('GET /api/destinos/:id responde 404 para id inexistente', () =>
      http().get('/api/destinos/999999').expect(404));

    it('POST /api/viagens/:id/destinos adiciona ao roteiro no fim da ordem', async () => {
      const { body } = await http()
        .post(`/api/viagens/${viagemId}/destinos`)
        .set(comToken(tokenCriador))
        .send({ destinoCatalogoId, chegada: '2027-01-10', saida: '2027-01-15' })
        .expect(201);

      destinoViagemId = body.id;
      expect(body.ordem).toBe(0);
      expect(body.destinoCatalogo.nome).toBe('Lisboa');
    });

    it('GET /api/viagens/:id/destinos lista o roteiro', async () => {
      const { body } = await http()
        .get(`/api/viagens/${viagemId}/destinos`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0]._count.atividades).toBe(0);
    });

    it('PATCH /api/viagens/:id/destinos/:destinoId edita o trecho', async () => {
      const { body } = await http()
        .patch(`/api/viagens/${viagemId}/destinos/${destinoViagemId}`)
        .set(comToken(tokenCriador))
        .send({ descricao: 'Primeira parada' })
        .expect(200);

      expect(body.descricao).toBe('Primeira parada');
    });
  });

  describe('Atividades (RF12 a RF14, RF23 a RF25)', () => {
    it('POST /api/atividades cadastra no catalogo', async () => {
      const { body } = await http()
        .post('/api/atividades')
        .set(comToken(tokenCriador))
        .send({
          nome: 'Passeio de bonde',
          cidade: 'Lisboa',
          pais: 'Portugal',
          tipoAtividade: 'PASSEIO',
        })
        .expect(201);

      atividadeCatalogoId = body.id;
    });

    it('GET /api/atividades e publico e filtra por tipo', async () => {
      const { body } = await http().get('/api/atividades?tipoAtividade=PASSEIO').expect(200);
      expect(body.total).toBe(1);
    });

    it('GET /api/atividades/destaques ignora atividades sem avaliacao', async () => {
      const { body } = await http().get('/api/atividades/destaques').expect(200);
      expect(body).toEqual([]);
    });

    it('GET /api/atividades/:id devolve a pagina publica', async () => {
      const { body } = await http().get(`/api/atividades/${atividadeCatalogoId}`).expect(200);
      expect(body.avaliacoes).toEqual([]);
    });

    it('POST /api/atividades/importar ainda responde 501 (Google Places)', () =>
      http()
        .post('/api/atividades/importar')
        .set(comToken(tokenCriador))
        .send({ placeId: 'qualquer' })
        .expect(501));

    it('POST /api/viagens/:id/atividades agenda no destino', async () => {
      const { body } = await http()
        .post(`/api/viagens/${viagemId}/atividades`)
        .set(comToken(tokenCriador))
        .send({
          destinoViagemId,
          catalogoAtividadeId: atividadeCatalogoId,
          dataHorario: '2027-01-11T10:00:00.000Z',
          custoPrevisto: 250.5,
        })
        .expect(201);

      atividadeViagemId = body.id;
      // Decimal chega como string, conforme a descricao da API.
      expect(body.custoPrevisto).toBe('250.5');
    });

    it('POST /api/viagens/:id/atividades recusa destino de outra viagem', () =>
      http()
        .post(`/api/viagens/${viagemId}/atividades`)
        .set(comToken(tokenCriador))
        .send({ destinoViagemId: 999999, catalogoAtividadeId: atividadeCatalogoId })
        .expect(400));

    it('GET /api/viagens/:id/atividades lista em ordem de roteiro', async () => {
      const { body } = await http()
        .get(`/api/viagens/${viagemId}/atividades`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].catalogoAtividade.nome).toBe('Passeio de bonde');
    });

    it('PATCH /api/viagens/:id/atividades/:atividadeId muda custo e status', async () => {
      const { body } = await http()
        .patch(`/api/viagens/${viagemId}/atividades/${atividadeViagemId}`)
        .set(comToken(tokenCriador))
        .send({ custoPrevisto: 300, status: 'CONFIRMADA' })
        .expect(200);

      expect(body.custoPrevisto).toBe('300');
      expect(body.status).toBe('CONFIRMADA');
    });
  });

  describe('Orcamento (RF15 a RF17)', () => {
    it('GET /api/viagens/:id/orcamento responde 404 antes de ser definido', () =>
      http().get(`/api/viagens/${viagemId}/orcamento`).set(comToken(tokenCriador)).expect(404));

    it('PUT /api/viagens/:id/orcamento define o total e ja soma as atividades', async () => {
      const { body } = await http()
        .put(`/api/viagens/${viagemId}/orcamento`)
        .set(comToken(tokenCriador))
        .send({ valorTotal: 1000 })
        .expect(200);

      expect(body.valorTotal).toBe('1000');
      expect(body.previstoAtividades).toBe('300');
    });

    it('GET /api/viagens/:id/orcamento/resumo calcula saldo e percentuais', async () => {
      const { body } = await http()
        .get(`/api/viagens/${viagemId}/orcamento/resumo`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body).toMatchObject({
        orcamentoTotal: 1000,
        totalPlanejado: 300,
        saldoDisponivel: 700,
        percentualConsumido: 30,
      });
      expect(body.porCategoria).toEqual([{ tipoAtividade: 'PASSEIO', total: 300, percentual: 30 }]);
    });
  });

  describe('Colaboracao (RF18 a RF20, RN02 a RN04)', () => {
    it('POST /api/viagens/:codigo/membros/entrar aceita o convite como VISUALIZADOR', async () => {
      const { body } = await http()
        .post(`/api/viagens/${viagemId}/membros/entrar`)
        .set(comToken(tokenColaborador))
        .expect(201);

      membroId = body.id;
      expect(body.permissao).toBe('VISUALIZADOR');
      expect(body.usuario.id).toBe(idColaborador);
    });

    it('POST .../membros/entrar recusa quem ja participa com 409', () =>
      http()
        .post(`/api/viagens/${viagemId}/membros/entrar`)
        .set(comToken(tokenColaborador))
        .expect(409));

    it('POST .../membros/entrar recusa o proprio criador com 409', () =>
      http()
        .post(`/api/viagens/${viagemId}/membros/entrar`)
        .set(comToken(tokenCriador))
        .expect(409));

    it('o VISUALIZADOR le a viagem mas nao edita (RN02)', async () => {
      await http().get(`/api/viagens/${viagemId}`).set(comToken(tokenColaborador)).expect(200);

      await http()
        .patch(`/api/viagens/${viagemId}`)
        .set(comToken(tokenColaborador))
        .send({ nome: 'Tentativa indevida' })
        .expect(403);
    });

    it('GET .../membros lista os colaboradores', async () => {
      const { body } = await http()
        .get(`/api/viagens/${viagemId}/membros`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body).toHaveLength(1);
    });

    it('PATCH .../membros/:membroId promove a EDITOR e a edicao passa a funcionar', async () => {
      await http()
        .patch(`/api/viagens/${viagemId}/membros/${membroId}`)
        .set(comToken(tokenCriador))
        .send({ permissao: 'EDITOR' })
        .expect(200);

      await http()
        .patch(`/api/viagens/${viagemId}`)
        .set(comToken(tokenColaborador))
        .send({ nome: 'Eurotrip 2027 - editada pelo colaborador' })
        .expect(200);
    });

    it('PATCH .../membros/:membroId exige ser o criador (RN04)', () =>
      http()
        .patch(`/api/viagens/${viagemId}/membros/${membroId}`)
        .set(comToken(tokenColaborador))
        .send({ permissao: 'VISUALIZADOR' })
        .expect(403));

    it('DELETE .../membros/sair recusa o criador com 400', () =>
      http()
        .delete(`/api/viagens/${viagemId}/membros/sair`)
        .set(comToken(tokenCriador))
        .expect(400));
  });

  describe('Avaliacoes (RF22, RF23, RN05)', () => {
    it('POST /api/atividades/:id/avaliacoes cria a review e recalcula a media', async () => {
      const { body } = await http()
        .post(`/api/atividades/${atividadeCatalogoId}/avaliacoes`)
        .set(comToken(tokenCriador))
        .send({ nota: 4, comentario: 'Muito bom' })
        .expect(201);

      avaliacaoId = body.id;

      const atividade = await http().get(`/api/atividades/${atividadeCatalogoId}`).expect(200);
      expect(Number(atividade.body.mediaAvaliacao)).toBe(4);
    });

    it('avaliar de novo substitui a nota anterior (RN05)', async () => {
      await http()
        .post(`/api/atividades/${atividadeCatalogoId}/avaliacoes`)
        .set(comToken(tokenCriador))
        .send({ nota: 2 })
        .expect(201);

      const { body } = await http()
        .get(`/api/atividades/${atividadeCatalogoId}/avaliacoes`)
        .expect(200);

      expect(body).toHaveLength(1);
      expect(body[0].nota).toBe(2);
    });

    it('a media considera as notas de varios usuarios', async () => {
      await http()
        .post(`/api/atividades/${atividadeCatalogoId}/avaliacoes`)
        .set(comToken(tokenColaborador))
        .send({ nota: 4 })
        .expect(201);

      const { body } = await http().get(`/api/atividades/${atividadeCatalogoId}`).expect(200);
      expect(Number(body.mediaAvaliacao)).toBe(3);
    });

    it('GET /api/atividades/destaques passa a incluir a atividade avaliada', async () => {
      const { body } = await http().get('/api/atividades/destaques').expect(200);
      expect(body).toHaveLength(1);
    });

    it('POST /api/atividades/:id/avaliacoes recusa nota fora de 1 a 5', () =>
      http()
        .post(`/api/atividades/${atividadeCatalogoId}/avaliacoes`)
        .set(comToken(tokenCriador))
        .send({ nota: 9 })
        .expect(400));

    it('DELETE /api/avaliacoes/:id recusa quem nao e o autor com 403', () =>
      http().delete(`/api/avaliacoes/${avaliacaoId}`).set(comToken(tokenEstranho)).expect(403));

    it('DELETE /api/avaliacoes/:id remove a propria e recalcula a media', async () => {
      await http().delete(`/api/avaliacoes/${avaliacaoId}`).set(comToken(tokenCriador)).expect(204);

      const { body } = await http().get(`/api/atividades/${atividadeCatalogoId}`).expect(200);
      expect(Number(body.mediaAvaliacao)).toBe(4);
    });
  });

  describe('Notificacoes (RF21)', () => {
    it('as tres rotas respondem 501, conforme o contrato publicado', async () => {
      await http().get('/api/notificacoes').set(comToken(tokenCriador)).expect(501);
      await http().patch('/api/notificacoes/lidas').set(comToken(tokenCriador)).expect(501);
      await http().patch('/api/notificacoes/1/lida').set(comToken(tokenCriador)).expect(501);
    });
  });

  describe('Remocoes e cascata', () => {
    it('DELETE .../atividades/:id remove e atualiza o previsto do orcamento', async () => {
      await http()
        .delete(`/api/viagens/${viagemId}/atividades/${atividadeViagemId}`)
        .set(comToken(tokenCriador))
        .expect(204);

      const { body } = await http()
        .get(`/api/viagens/${viagemId}/orcamento`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body.previstoAtividades).toBe('0');
    });

    it('DELETE .../destinos/:id remove o trecho do roteiro', async () => {
      await http()
        .delete(`/api/viagens/${viagemId}/destinos/${destinoViagemId}`)
        .set(comToken(tokenCriador))
        .expect(204);

      const { body } = await http()
        .get(`/api/viagens/${viagemId}/destinos`)
        .set(comToken(tokenCriador))
        .expect(200);

      expect(body).toEqual([]);
    });

    it('DELETE .../membros/:membroId remove o colaborador, que perde o acesso', async () => {
      await http()
        .delete(`/api/viagens/${viagemId}/membros/${membroId}`)
        .set(comToken(tokenCriador))
        .expect(204);

      await http().get(`/api/viagens/${viagemId}`).set(comToken(tokenColaborador)).expect(404);
    });

    it('DELETE /api/viagens/:id exige o criador e apaga a viagem em cascata', async () => {
      await http().delete(`/api/viagens/${viagemId}`).set(comToken(tokenCriador)).expect(204);

      await http().get(`/api/viagens/${viagemId}`).set(comToken(tokenCriador)).expect(404);

      // O orcamento cai junto com a viagem (onDelete: Cascade).
      expect(await prisma.orcamento.count()).toBe(0);
    });
  });
});
