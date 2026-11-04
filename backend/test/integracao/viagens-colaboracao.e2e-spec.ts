import {
  AppDeTeste,
  bearer,
  comBanco,
  Conta,
  criarApp,
  limparBanco,
  registrar,
} from '../apoio/app';

/** Viagens, convite por codigo, permissoes e notificacoes - contra o banco real. */
comBanco('Viagens e colaboracao (integracao)', () => {
  let t: AppDeTeste;
  let ana: Conta;
  let bruno: Conta;
  let carla: Conta;
  let viagemId: string;
  let codigoConvite: string;
  let membroBrunoId: number;

  beforeAll(async () => {
    t = await criarApp();
    await limparBanco(t.app);
    ana = await registrar(t.http, 'Ana', 'ana@teste.com');
    bruno = await registrar(t.http, 'Bruno', 'bruno@teste.com');
    carla = await registrar(t.http, 'Carla', 'carla@teste.com');
  });

  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
  });

  const notificacoesDe = async (conta: Conta) =>
    (await t.http().get('/api/v1/notificacoes').set(bearer(conta.token)).expect(200)).body;

  describe('viagens', () => {
    it('cria a viagem com datas so-dia e devolve o convite para o criador', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/viagens')
        .set(bearer(ana.token))
        .send({ nome: 'Eurotrip', dataInicio: '2027-01-10', dataFim: '2027-01-25' })
        .expect(201);

      expect(body).toMatchObject({
        nome: 'Eurotrip',
        dataInicio: '2027-01-10',
        dataFim: '2027-01-25',
        status: 'EM_PLANEJAMENTO',
        criadoPor: ana.id,
        minhaPermissao: 'CRIADOR',
        codigoConvite: expect.stringMatching(/^[A-Z2-9]{8}$/),
      });
      expect(body.codigoConvite).not.toBe(body.id);

      viagemId = body.id;
      codigoConvite = body.codigoConvite;
    });

    it('recusa periodo invertido e dia inexistente com codigos proprios', async () => {
      const invertido = await t
        .http()
        .post('/api/v1/viagens')
        .set(bearer(ana.token))
        .send({ nome: 'X', dataInicio: '2027-02-10', dataFim: '2027-02-01' })
        .expect(400);
      expect(invertido.body.codigo).toBe('PERIODO_INVALIDO');

      const inexistente = await t
        .http()
        .post('/api/v1/viagens')
        .set(bearer(ana.token))
        .send({ nome: 'X', dataInicio: '2027-02-31' })
        .expect(400);
      expect(inexistente.body.codigo).toBe('DATA_INEXISTENTE');
    });

    it('quem nao participa recebe 404, e nao 403', async () => {
      const { body } = await t
        .http()
        .get(`/api/v1/viagens/${viagemId}`)
        .set(bearer(carla.token))
        .expect(404);

      expect(body.codigo).toBe('VIAGEM_NAO_ENCONTRADA');
    });
  });

  describe('convite e membros', () => {
    it('mostra a viagem do convite antes de aceitar', async () => {
      const { body } = await t
        .http()
        .get(`/api/v1/convites/${codigoConvite.toLowerCase()}`)
        .set(bearer(bruno.token))
        .expect(200);

      expect(body).toEqual({
        viagemId,
        nome: 'Eurotrip',
        dataInicio: '2027-01-10',
        dataFim: '2027-01-25',
        criador: { id: ana.id, nome: 'Ana' },
        totalColaboradores: 0,
      });
    });

    it('aceitar entra como VISUALIZADOR e avisa o criador', async () => {
      const { body } = await t
        .http()
        .post(`/api/v1/convites/${codigoConvite}/aceitar`)
        .set(bearer(bruno.token))
        .expect(201);

      expect(body).toMatchObject({ viagemId, usuarioId: bruno.id, permissao: 'VISUALIZADOR' });
      membroBrunoId = body.id;

      const avisos = await notificacoesDe(ana);
      expect(avisos.itens[0]).toMatchObject({ tipo: 'MEMBRO_ENTROU', lida: false });
      expect(avisos.itens[0].mensagem).toBe('Bruno entrou em Eurotrip');
    });

    it('aceitar de novo, ou o proprio criador, da JA_PARTICIPA', async () => {
      for (const conta of [bruno, ana]) {
        const { body } = await t
          .http()
          .post(`/api/v1/convites/${codigoConvite}/aceitar`)
          .set(bearer(conta.token))
          .expect(409);
        expect(body.codigo).toBe('JA_PARTICIPA');
      }
    });

    it('o colaborador ve a viagem sem o codigo de convite', async () => {
      const { body } = await t
        .http()
        .get(`/api/v1/viagens/${viagemId}`)
        .set(bearer(bruno.token))
        .expect(200);

      expect(body).toMatchObject({ minhaPermissao: 'VISUALIZADOR', codigoConvite: null });
      expect(body.membros).toHaveLength(1);
      expect(body.criador).toEqual({ id: ana.id, nome: 'Ana', email: 'ana@teste.com' });
    });

    it('VISUALIZADOR nao edita; o criador promove a EDITOR', async () => {
      const negado = await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}`)
        .set(bearer(bruno.token))
        .send({ nome: 'Tentativa' })
        .expect(403);
      expect(negado.body.codigo).toBe('SOMENTE_LEITURA');

      const naoCriador = await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}/membros/${membroBrunoId}`)
        .set(bearer(bruno.token))
        .send({ permissao: 'EDITOR' })
        .expect(403);
      expect(naoCriador.body.codigo).toBe('APENAS_CRIADOR');

      await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}/membros/${membroBrunoId}`)
        .set(bearer(ana.token))
        .send({ permissao: 'EDITOR' })
        .expect(200);

      const avisos = await notificacoesDe(bruno);
      expect(avisos.itens[0]).toMatchObject({ tipo: 'PERMISSAO_ALTERADA' });
    });

    it('a edicao do EDITOR avisa o criador, nunca o proprio autor', async () => {
      const antesBruno = (await notificacoesDe(bruno)).total;

      const { body } = await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}`)
        .set(bearer(bruno.token))
        .send({ descricao: '  Quinze dias  ', status: 'CONFIRMADA' })
        .expect(200);

      expect(body).toMatchObject({
        descricao: 'Quinze dias',
        status: 'CONFIRMADA',
        minhaPermissao: 'EDITOR',
      });
      expect((await notificacoesDe(bruno)).total).toBe(antesBruno);
      expect((await notificacoesDe(ana)).itens[0]).toMatchObject({ tipo: 'VIAGEM_ATUALIZADA' });
    });

    it('PATCH com null apaga a descricao; nome null e invalido', async () => {
      const { body } = await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}`)
        .set(bearer(ana.token))
        .send({ descricao: null })
        .expect(200);
      expect(body.descricao).toBeNull();

      await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}`)
        .set(bearer(ana.token))
        .send({ nome: null })
        .expect(400);
    });

    it('gerar novo convite invalida o anterior', async () => {
      const { body } = await t
        .http()
        .post(`/api/v1/viagens/${viagemId}/convite`)
        .set(bearer(ana.token))
        .expect(200);

      expect(body.codigoConvite).not.toBe(codigoConvite);

      const antigo = await t
        .http()
        .post(`/api/v1/convites/${codigoConvite}/aceitar`)
        .set(bearer(carla.token))
        .expect(404);
      expect(antigo.body.codigo).toBe('CONVITE_INVALIDO');

      codigoConvite = body.codigoConvite;
    });

    it('lista as minhas viagens com papel, totais e filtro de status', async () => {
      const { body } = await t.http().get('/api/v1/viagens').set(bearer(bruno.token)).expect(200);

      expect(body).toMatchObject({ total: 1, pagina: 1, limite: 20 });
      expect(body.itens[0]).toMatchObject({
        id: viagemId,
        minhaPermissao: 'EDITOR',
        totais: { colaboradores: 1, destinos: 0 },
      });
      expect(body.itens[0]).not.toHaveProperty('_count');

      const filtrado = await t
        .http()
        .get('/api/v1/viagens?status=CONCLUIDA')
        .set(bearer(bruno.token))
        .expect(200);
      expect(filtrado.body.total).toBe(0);
    });

    it('o criador nao sai; o colaborador sai e quem ficou e avisado', async () => {
      const criador = await t
        .http()
        .delete(`/api/v1/viagens/${viagemId}/membros/eu`)
        .set(bearer(ana.token))
        .expect(400);
      expect(criador.body.codigo).toBe('CRIADOR_NAO_SAI');

      await t
        .http()
        .delete(`/api/v1/viagens/${viagemId}/membros/eu`)
        .set(bearer(bruno.token))
        .expect(204);

      expect((await notificacoesDe(ana)).itens[0]).toMatchObject({ tipo: 'MEMBRO_SAIU' });
      await t.http().get(`/api/v1/viagens/${viagemId}`).set(bearer(bruno.token)).expect(404);
    });

    it('o criador remove um colaborador, que recebe o aviso', async () => {
      const { body: membro } = await t
        .http()
        .post(`/api/v1/convites/${codigoConvite}/aceitar`)
        .set(bearer(carla.token))
        .expect(201);

      const outraViagem = await t
        .http()
        .delete(`/api/v1/viagens/${viagemId}/membros/999999`)
        .set(bearer(ana.token))
        .expect(404);
      expect(outraViagem.body.codigo).toBe('MEMBRO_NAO_ENCONTRADO');

      await t
        .http()
        .delete(`/api/v1/viagens/${viagemId}/membros/${membro.id}`)
        .set(bearer(ana.token))
        .expect(204);

      expect((await notificacoesDe(carla)).itens[0]).toMatchObject({ tipo: 'MEMBRO_REMOVIDO' });
    });
  });

  describe('notificacoes', () => {
    it('conta, marca uma, desmarca e marca todas como lidas', async () => {
      const { body: contagem } = await t
        .http()
        .get('/api/v1/notificacoes/contagem')
        .set(bearer(ana.token))
        .expect(200);
      expect(contagem.naoLidas).toBeGreaterThan(1);

      const { itens } = await notificacoesDe(ana);
      const { body: lida } = await t
        .http()
        .patch(`/api/v1/notificacoes/${itens[0].id}`)
        .set(bearer(ana.token))
        .send({ lida: true })
        .expect(200);
      expect(lida).toMatchObject({ id: itens[0].id, lida: true, lidaEm: expect.any(String) });

      const apenasNaoLidas = await t
        .http()
        .get('/api/v1/notificacoes?apenasNaoLidas=true')
        .set(bearer(ana.token))
        .expect(200);
      expect(apenasNaoLidas.body.total).toBe(contagem.naoLidas - 1);

      await t
        .http()
        .patch(`/api/v1/notificacoes/${itens[0].id}`)
        .set(bearer(ana.token))
        .send({ lida: false })
        .expect(200);

      const { body: lote } = await t
        .http()
        .post('/api/v1/notificacoes/marcar-como-lidas')
        .set(bearer(ana.token))
        .expect(200);
      expect(lote.atualizadas).toBe(contagem.naoLidas);
    });

    it('nao deixa mexer na notificacao de outra pessoa', async () => {
      const { itens } = await notificacoesDe(ana);

      const { body } = await t
        .http()
        .patch(`/api/v1/notificacoes/${itens[0].id}`)
        .set(bearer(carla.token))
        .send({ lida: true })
        .expect(404);
      expect(body.codigo).toBe('NOTIFICACAO_NAO_ENCONTRADA');
    });
  });

  describe('exclusao', () => {
    it('so o criador exclui, e a viagem some para todos', async () => {
      await t
        .http()
        .post(`/api/v1/convites/${codigoConvite}/aceitar`)
        .set(bearer(bruno.token))
        .expect(201);

      const { body } = await t
        .http()
        .delete(`/api/v1/viagens/${viagemId}`)
        .set(bearer(bruno.token))
        .expect(403);
      expect(body.codigo).toBe('APENAS_CRIADOR');

      await t.http().delete(`/api/v1/viagens/${viagemId}`).set(bearer(ana.token)).expect(204);
      await t.http().get(`/api/v1/viagens/${viagemId}`).set(bearer(ana.token)).expect(404);
    });
  });
});
