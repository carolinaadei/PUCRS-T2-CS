import {
  AppDeTeste,
  bearer,
  comBanco,
  Conta,
  criarApp,
  limparBanco,
  registrar,
} from '../apoio/app';

/** Destinos da viagem, atividades e orcamento - contra o banco real. */
comBanco('Roteiro: destinos, atividades e orcamento (integracao)', () => {
  let t: AppDeTeste;
  let ana: Conta;
  let bruno: Conta;
  let viagemId: string;
  let lisboa: number;
  let porto: number;
  let madri: number;
  let torre: number;
  let jantar: number;
  const destinos: Record<string, number> = {};
  let atividadeId: number;

  const url = (caminho = '') => `/api/v1/viagens/${viagemId}${caminho}`;

  beforeAll(async () => {
    t = await criarApp();
    await limparBanco(t.app);
    ana = await registrar(t.http, 'Ana', 'ana@teste.com');
    bruno = await registrar(t.http, 'Bruno', 'bruno@teste.com');

    const { body: viagem } = await t
      .http()
      .post('/api/v1/viagens')
      .set(bearer(ana.token))
      .send({ nome: 'Peninsula', dataInicio: '2027-01-10', dataFim: '2027-01-25' })
      .expect(201);
    viagemId = viagem.id;

    const { body: membro } = await t
      .http()
      .post(`/api/v1/convites/${viagem.codigoConvite}/aceitar`)
      .set(bearer(bruno.token))
      .expect(201);
    await t
      .http()
      .patch(url(`/membros/${membro.id}`))
      .set(bearer(ana.token))
      .send({ permissao: 'EDITOR' })
      .expect(200);

    const criarDestino = async (nome: string) =>
      (
        await t
          .http()
          .post('/api/v1/destinos')
          .set(bearer(ana.token))
          .send({ nome, pais: 'Portugal' })
          .expect(201)
      ).body.id as number;
    lisboa = await criarDestino('Lisboa');
    porto = await criarDestino('Porto');
    madri = await criarDestino('Madri');

    const criarAtividade = async (nome: string, tipoAtividade: string) =>
      (
        await t
          .http()
          .post('/api/v1/atividades')
          .set(bearer(ana.token))
          .send({ nome, tipoAtividade, cidade: 'Lisboa' })
          .expect(201)
      ).body.id as number;
    torre = await criarAtividade('Torre de Belem', 'PASSEIO');
    jantar = await criarAtividade('Jantar de fado', 'REFEICAO');
  });

  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
  });

  describe('destinos da viagem', () => {
    it('adiciona no fim do roteiro com datas so-dia', async () => {
      const { body } = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: lisboa, chegada: '2027-01-10', saida: '2027-01-15' })
        .expect(201);

      expect(body).toMatchObject({
        ordem: 0,
        chegada: '2027-01-10',
        saida: '2027-01-15',
        destinoCatalogo: { id: lisboa, nome: 'Lisboa' },
      });
      destinos.lisboa = body.id;

      const { body: porto_ } = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(bruno.token))
        .send({ destinoCatalogoId: porto, chegada: '2027-01-15', saida: '2027-01-20' })
        .expect(201);
      destinos.porto = porto_.id;
      expect(porto_.ordem).toBe(1);
    });

    it('com `ordem`, insere na posicao e empurra os seguintes', async () => {
      const { body } = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: madri, ordem: 0 })
        .expect(201);
      destinos.madri = body.id;

      const { body: lista } = await t
        .http()
        .get(url('/destinos'))
        .set(bearer(ana.token))
        .expect(200);
      expect(lista.map((d: { id: number; ordem: number }) => [d.id, d.ordem])).toEqual([
        [destinos.madri, 0],
        [destinos.lisboa, 1],
        [destinos.porto, 2],
      ]);
      expect(lista[0].totais).toEqual({ atividades: 0 });
    });

    it('recusa datas fora do periodo da viagem e catalogo inexistente', async () => {
      const fora = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: lisboa, chegada: '2030-05-01' })
        .expect(400);
      expect(fora.body.codigo).toBe('DESTINO_FORA_DO_PERIODO');

      const invertido = await t
        .http()
        .patch(url(`/destinos/${destinos.porto}`))
        .set(bearer(ana.token))
        .send({ saida: '2027-01-12' })
        .expect(400);
      expect(invertido.body.codigo).toBe('DESTINO_FORA_DO_PERIODO');

      const comHorario = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: lisboa, chegada: '2027-01-10T23:30:00-03:00' })
        .expect(400);
      expect(comHorario.body.codigo).toBe('VALIDACAO');

      const inexistente = await t
        .http()
        .post(url('/destinos'))
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: 999999 })
        .expect(404);
      expect(inexistente.body.codigo).toBe('DESTINO_CATALOGO_NAO_ENCONTRADO');
    });

    it('PATCH move de posicao e `null` apaga a data', async () => {
      const { body } = await t
        .http()
        .patch(url(`/destinos/${destinos.madri}`))
        .set(bearer(ana.token))
        .send({ ordem: 5, descricao: 'Ultima parada' })
        .expect(200);
      expect(body).toMatchObject({ ordem: 2, descricao: 'Ultima parada' });

      const { body: semData } = await t
        .http()
        .patch(url(`/destinos/${destinos.lisboa}`))
        .set(bearer(ana.token))
        .send({ saida: null })
        .expect(200);
      expect(semData).toMatchObject({ chegada: '2027-01-10', saida: null, ordem: 0 });
    });

    it('PUT /destinos/ordem reescreve o roteiro e exige todos os ids', async () => {
      const incompleto = await t
        .http()
        .put(url('/destinos/ordem'))
        .set(bearer(ana.token))
        .send({ destinos: [destinos.porto] })
        .expect(400);
      expect(incompleto.body.codigo).toBe('ORDEM_INVALIDA');

      const { body } = await t
        .http()
        .put(url('/destinos/ordem'))
        .set(bearer(ana.token))
        .send({ destinos: [destinos.porto, destinos.madri, destinos.lisboa] })
        .expect(200);
      expect(body.map((d: { id: number }) => d.id)).toEqual([
        destinos.porto,
        destinos.madri,
        destinos.lisboa,
      ]);
    });

    it('o periodo da viagem nao pode encolher deixando destinos de fora', async () => {
      const { body } = await t
        .http()
        .patch(url())
        .set(bearer(ana.token))
        .send({ dataFim: '2027-01-16' })
        .expect(400);
      expect(body.codigo).toBe('DESTINOS_FORA_DO_PERIODO');
    });
  });

  describe('atividades e orcamento', () => {
    it('define o orcamento e devolve valores como string com 2 casas', async () => {
      const { body } = await t
        .http()
        .put(url('/orcamento'))
        .set(bearer(bruno.token))
        .send({ valorTotal: 1000 })
        .expect(200);

      expect(body).toEqual({
        viagemId,
        valorTotal: '1000.00',
        previstoAtividades: '0.00',
        saldoDisponivel: '1000.00',
      });
    });

    it('agenda atividade com horario com fuso e soma o custo no orcamento', async () => {
      const { body } = await t
        .http()
        .post(url('/atividades'))
        .set(bearer(ana.token))
        .send({
          destinoViagemId: destinos.lisboa,
          catalogoAtividadeId: torre,
          dataHorario: '2027-01-11T14:30:00-03:00',
          duracaoMin: 90,
          custoPrevisto: 120.5,
        })
        .expect(201);

      expect(body).toMatchObject({
        status: 'PENDENTE',
        custoPrevisto: '120.50',
        dataHorario: '2027-01-11T17:30:00.000Z',
        catalogoAtividade: { id: torre, totalAvaliacoes: 0 },
      });
      atividadeId = body.id;

      await t
        .http()
        .post(url('/atividades'))
        .set(bearer(ana.token))
        .send({
          destinoViagemId: destinos.lisboa,
          catalogoAtividadeId: jantar,
          custoPrevisto: 79.5,
        })
        .expect(201);

      const { body: orcamento } = await t
        .http()
        .get(url('/orcamento'))
        .set(bearer(ana.token))
        .expect(200);
      expect(orcamento).toMatchObject({ previstoAtividades: '200.00', saldoDisponivel: '800.00' });
    });

    it('exige horario com fuso e destino desta viagem', async () => {
      const semFuso = await t
        .http()
        .post(url('/atividades'))
        .set(bearer(ana.token))
        .send({
          destinoViagemId: destinos.lisboa,
          catalogoAtividadeId: torre,
          dataHorario: '2027-01-11T14:30:00',
        })
        .expect(400);
      expect(semFuso.body.codigo).toBe('VALIDACAO');

      const diaInexistente = await t
        .http()
        .post(url('/atividades'))
        .set(bearer(ana.token))
        .send({
          destinoViagemId: destinos.lisboa,
          catalogoAtividadeId: torre,
          dataHorario: '2027-02-31T10:00:00Z',
        })
        .expect(400);
      expect(diaInexistente.body.codigo).toBe('DATA_INEXISTENTE');

      const outraViagem = await t
        .http()
        .post(url('/atividades'))
        .set(bearer(ana.token))
        .send({ destinoViagemId: 999999, catalogoAtividadeId: torre })
        .expect(400);
      expect(outraViagem.body.codigo).toBe('DESTINO_DE_OUTRA_VIAGEM');
    });

    it('PATCH com null apaga o custo e recalcula o previsto', async () => {
      const { body } = await t
        .http()
        .patch(url(`/atividades/${atividadeId}`))
        .set(bearer(bruno.token))
        .send({ custoPrevisto: null, status: 'CONCLUIDA', dataHorario: null })
        .expect(200);
      expect(body).toMatchObject({ custoPrevisto: null, status: 'CONCLUIDA', dataHorario: null });

      const { body: orcamento } = await t
        .http()
        .get(url('/orcamento'))
        .set(bearer(ana.token))
        .expect(200);
      expect(orcamento.previstoAtividades).toBe('79.50');
    });

    it('lista em ordem de visita, com o destino de cada atividade', async () => {
      const { body } = await t.http().get(url('/atividades')).set(bearer(ana.token)).expect(200);

      expect(body).toHaveLength(2);
      expect(body[0].destinoViagem).toEqual({
        id: destinos.lisboa,
        ordem: 2,
        destinoCatalogo: { id: lisboa, nome: 'Lisboa', pais: 'Portugal' },
      });

      const filtro = await t
        .http()
        .get(url(`/atividades?destinoViagemId=${destinos.porto}`))
        .set(bearer(ana.token))
        .expect(200);
      expect(filtro.body).toEqual([]);

      const filtroInvalido = await t
        .http()
        .get(url('/atividades?destinoViagemId=abc'))
        .set(bearer(ana.token))
        .expect(400);
      expect(filtroInvalido.body.codigo).toBe('ID_INVALIDO');
    });

    it('resume os gastos por categoria', async () => {
      const { body } = await t
        .http()
        .get(url('/orcamento/resumo'))
        .set(bearer(ana.token))
        .expect(200);

      expect(body).toEqual({
        orcamentoDefinido: true,
        orcamentoTotal: '1000.00',
        totalPlanejado: '79.50',
        saldoDisponivel: '920.50',
        percentualConsumido: 7.95,
        porCategoria: [{ tipoAtividade: 'REFEICAO', total: '79.50', percentual: 7.95 }],
      });
    });

    it('remover o destino leva as atividades e atualiza o orcamento', async () => {
      await t
        .http()
        .delete(url(`/destinos/${destinos.lisboa}`))
        .set(bearer(ana.token))
        .expect(204);

      const { body: orcamento } = await t
        .http()
        .get(url('/orcamento'))
        .set(bearer(ana.token))
        .expect(200);
      expect(orcamento.previstoAtividades).toBe('0.00');

      const { body: roteiro } = await t
        .http()
        .get(url('/destinos'))
        .set(bearer(ana.token))
        .expect(200);
      expect(roteiro.map((d: { ordem: number }) => d.ordem)).toEqual([0, 1]);

      const removido = await t
        .http()
        .delete(url(`/atividades/${atividadeId}`))
        .set(bearer(ana.token))
        .expect(404);
      expect(removido.body.codigo).toBe('ATIVIDADE_NAO_ENCONTRADA');
    });

    it('apaga o orcamento; buscar depois responde ORCAMENTO_NAO_DEFINIDO', async () => {
      await t.http().delete(url('/orcamento')).set(bearer(ana.token)).expect(204);

      const { body } = await t.http().get(url('/orcamento')).set(bearer(ana.token)).expect(404);
      expect(body.codigo).toBe('ORCAMENTO_NAO_DEFINIDO');

      const { body: resumo } = await t
        .http()
        .get(url('/orcamento/resumo'))
        .set(bearer(ana.token))
        .expect(200);
      expect(resumo).toMatchObject({
        orcamentoDefinido: false,
        orcamentoTotal: '0.00',
        percentualConsumido: 0,
      });
    });

    it('as alteracoes do Bruno viraram avisos para a Ana', async () => {
      const { body } = await t
        .http()
        .get('/api/v1/notificacoes?limite=100')
        .set(bearer(ana.token))
        .expect(200);
      const tipos = body.itens.map((n: { tipo: string }) => n.tipo);

      expect(tipos).toEqual(
        expect.arrayContaining([
          'DESTINO_ADICIONADO',
          'ORCAMENTO_ATUALIZADO',
          'ATIVIDADE_ATUALIZADA',
        ]),
      );
    });
  });
});
