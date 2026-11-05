import {
  AppDeTeste,
  bearer,
  comBanco,
  Conta,
  criarApp,
  limparBanco,
  registrar,
} from '../apoio/app';

/** Catalogos com dono, avaliacoes so de quem fez e destaques - contra o banco real. */
comBanco('Catalogo e avaliacoes (integracao)', () => {
  let t: AppDeTeste;
  let ana: Conta;
  let bruno: Conta;
  let lisboa: number;
  let torre: number;
  let viagemId: string;
  let atividadeNaViagem: number;

  beforeAll(async () => {
    t = await criarApp();
    await limparBanco(t.app);
    ana = await registrar(t.http, 'Ana', 'ana@teste.com');
    bruno = await registrar(t.http, 'Bruno', 'bruno@teste.com');
  });

  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
  });

  describe('catalogo de destinos', () => {
    it('cadastra com autor e pesquisa sem login', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/destinos')
        .set(bearer(ana.token))
        .send({ nome: '  Lisboa ', pais: 'Portugal', categoria: 'CIDADE', descricao: '   ' })
        .expect(201);

      expect(body).toMatchObject({ nome: 'Lisboa', descricao: null, criadoPor: ana.id });
      lisboa = body.id;

      const { body: busca } = await t
        .http()
        .get('/api/v1/destinos?busca=lis&pais=portugal')
        .expect(200);
      expect(busca).toMatchObject({ total: 1, itens: [{ id: lisboa }] });
    });

    it('so quem cadastrou edita; null apaga campo opcional', async () => {
      const alheio = await t
        .http()
        .patch(`/api/v1/destinos/${lisboa}`)
        .set(bearer(bruno.token))
        .send({ descricao: 'Invasao' })
        .expect(403);
      expect(alheio.body.codigo).toBe('APENAS_QUEM_CADASTROU');

      const { body } = await t
        .http()
        .patch(`/api/v1/destinos/${lisboa}`)
        .set(bearer(ana.token))
        .send({ descricao: 'Capital', categoria: null })
        .expect(200);
      expect(body).toMatchObject({ descricao: 'Capital', categoria: null, nome: 'Lisboa' });
    });

    it('recusa mensagens de validacao em ingles: tudo sai em portugues', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/destinos')
        .set(bearer(ana.token))
        .send({ nome: '', latitude: 200, categoria: 'VULCAO', fotoUrl: 'nao-e-url' })
        .expect(400);

      const mensagens = body.detalhes
        .flatMap((d: { mensagens: string[] }) => d.mensagens)
        .join(' | ');
      expect(mensagens).toContain('O nome do destino nao pode ficar em branco');
      expect(mensagens).toContain('Informe uma latitude valida (entre -90 e 90)');
      expect(mensagens).toContain('Categoria invalida');
      expect(mensagens).toContain('Informe uma URL valida para a foto');
      expect(mensagens).not.toMatch(/should|must/);
    });

    it('nao exclui destino em uso; exclui o que ninguem usa', async () => {
      const { body: viagem } = await t
        .http()
        .post('/api/v1/viagens')
        .set(bearer(ana.token))
        .send({ nome: 'Lisboa 2026', dataInicio: '2026-05-01', dataFim: '2026-05-10' })
        .expect(201);
      viagemId = viagem.id;

      const { body: destinoViagem } = await t
        .http()
        .post(`/api/v1/viagens/${viagemId}/destinos`)
        .set(bearer(ana.token))
        .send({ destinoCatalogoId: lisboa })
        .expect(201);

      const emUso = await t
        .http()
        .delete(`/api/v1/destinos/${lisboa}`)
        .set(bearer(ana.token))
        .expect(409);
      expect(emUso.body.codigo).toBe('CATALOGO_EM_USO');

      const { body: avulso } = await t
        .http()
        .post('/api/v1/destinos')
        .set(bearer(ana.token))
        .send({ nome: 'Sintra' })
        .expect(201);
      await t.http().delete(`/api/v1/destinos/${avulso.id}`).set(bearer(ana.token)).expect(204);
      await t.http().get(`/api/v1/destinos/${avulso.id}`).expect(404);

      // Atividade concluida nesta viagem libera a avaliacao mais adiante.
      const { body: atividade } = await t
        .http()
        .post('/api/v1/atividades')
        .set(bearer(ana.token))
        .send({ nome: 'Torre de Belem', tipoAtividade: 'PASSEIO' })
        .expect(201);
      torre = atividade.id;
      expect(atividade).toMatchObject({ fonte: 'manual', criadoPor: ana.id, totalAvaliacoes: 0 });

      const { body: agendada } = await t
        .http()
        .post(`/api/v1/viagens/${viagemId}/atividades`)
        .set(bearer(ana.token))
        .send({ destinoViagemId: destinoViagem.id, catalogoAtividadeId: torre })
        .expect(201);
      atividadeNaViagem = agendada.id;
    });
  });

  describe('catalogo de atividades', () => {
    it('nao aceita forjar origem externa pelo cadastro manual', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/atividades')
        .set(bearer(bruno.token))
        .send({ nome: 'Copia', tipoAtividade: 'PASSEIO', fonte: 'geoapify', idExterno: 'forjado' })
        .expect(400);
      expect(body.codigo).toBe('VALIDACAO');
    });

    it('filtra por tipo e cidade sem login', async () => {
      await t
        .http()
        .patch(`/api/v1/atividades/${torre}`)
        .set(bearer(ana.token))
        .send({ cidade: 'Lisboa', pais: 'Portugal' })
        .expect(200);

      const { body } = await t
        .http()
        .get('/api/v1/atividades?tipoAtividade=PASSEIO&cidade=lisboa&notaMinima=0')
        .expect(200);
      expect(body.itens.map((a: { id: number }) => a.id)).toEqual([torre]);
    });

    it('nao exclui atividade agendada em viagem', async () => {
      const { body } = await t
        .http()
        .delete(`/api/v1/atividades/${torre}`)
        .set(bearer(ana.token))
        .expect(409);
      expect(body.codigo).toBe('CATALOGO_EM_USO');
    });
  });

  describe('avaliacoes', () => {
    const minha = () => `/api/v1/atividades/${torre}/avaliacoes/minha`;

    it('so avalia quem concluiu a atividade numa viagem de que participa', async () => {
      const pendente = await t
        .http()
        .put(minha())
        .set(bearer(ana.token))
        .send({ nota: 5 })
        .expect(403);
      expect(pendente.body.codigo).toBe('ATIVIDADE_NAO_REALIZADA');

      await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}/atividades/${atividadeNaViagem}`)
        .set(bearer(ana.token))
        .send({ status: 'CONCLUIDA' })
        .expect(200);

      const estranho = await t
        .http()
        .put(minha())
        .set(bearer(bruno.token))
        .send({ nota: 1 })
        .expect(403);
      expect(estranho.body.codigo).toBe('ATIVIDADE_NAO_REALIZADA');
    });

    it('PUT cria (201), depois substitui (200), e recalcula a media', async () => {
      const { body: criada } = await t
        .http()
        .put(minha())
        .set(bearer(ana.token))
        .send({ nota: 4, comentario: '  Vale a fila  ' })
        .expect(201);
      expect(criada).toMatchObject({
        nota: 4,
        comentario: 'Vale a fila',
        autor: { id: ana.id, nome: 'Ana' },
      });
      expect(criada.autor).not.toHaveProperty('email');

      const { body: trocada } = await t
        .http()
        .put(minha())
        .set(bearer(ana.token))
        .send({ nota: 5 })
        .expect(200);
      expect(trocada).toMatchObject({ id: criada.id, nota: 5, comentario: null });

      const { body: pagina } = await t.http().get(`/api/v1/atividades/${torre}`).expect(200);
      expect(pagina).toMatchObject({ mediaAvaliacao: 5, totalAvaliacoes: 1 });
      expect(pagina.avaliacoesRecentes).toHaveLength(1);
    });

    it('GET minha, lista publica paginada e destaques', async () => {
      await t.http().get(minha()).set(bearer(ana.token)).expect(200);
      const semAvaliacao = await t.http().get(minha()).set(bearer(bruno.token)).expect(404);
      expect(semAvaliacao.body.codigo).toBe('AVALIACAO_NAO_ENCONTRADA');

      const { body: lista } = await t
        .http()
        .get(`/api/v1/atividades/${torre}/avaliacoes?limite=1`)
        .expect(200);
      expect(lista).toMatchObject({ total: 1, limite: 1, itens: [{ nota: 5 }] });

      const { body: destaquesAtividades } = await t
        .http()
        .get('/api/v1/atividades/destaques')
        .expect(200);
      expect(destaquesAtividades[0]).toMatchObject({ id: torre, mediaAvaliacao: 5 });

      const { body: destaquesDestinos } = await t
        .http()
        .get('/api/v1/destinos/destaques')
        .expect(200);
      expect(destaquesDestinos[0]).toMatchObject({
        id: lisboa,
        mediaAvaliacao: 5,
        totalAvaliacoes: 1,
      });
    });

    it('DELETE minha remove e zera a media', async () => {
      await t.http().delete(minha()).set(bearer(ana.token)).expect(204);
      await t.http().delete(minha()).set(bearer(ana.token)).expect(404);

      const { body } = await t.http().get(`/api/v1/atividades/${torre}`).expect(200);
      expect(body).toMatchObject({ mediaAvaliacao: 0, totalAvaliacoes: 0 });
    });

    it('atividade inexistente responde 404 com codigo do catalogo', async () => {
      const { body } = await t.http().get('/api/v1/atividades/999999/avaliacoes').expect(404);
      expect(body.codigo).toBe('ATIVIDADE_CATALOGO_NAO_ENCONTRADA');
    });
  });

  describe('paises visitados', () => {
    it('conta so viagens concluidas', async () => {
      const antes = await t
        .http()
        .get('/api/v1/usuarios/eu/paises-visitados')
        .set(bearer(ana.token))
        .expect(200);
      expect(antes.body).toEqual([]);

      await t
        .http()
        .patch(`/api/v1/viagens/${viagemId}`)
        .set(bearer(ana.token))
        .send({ status: 'CONCLUIDA' })
        .expect(200);

      const { body } = await t
        .http()
        .get('/api/v1/usuarios/eu/paises-visitados')
        .set(bearer(ana.token))
        .expect(200);
      expect(body).toEqual([{ codigo: 'PT', nome: 'Portugal', viagens: 1 }]);
    });
  });
});
