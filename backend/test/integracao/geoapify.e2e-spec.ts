import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  AppDeTeste,
  bearer,
  comBanco,
  Conta,
  criarApp,
  limparBanco,
  registrar,
} from '../apoio/app';
import { atividadeGeoapify, cidadeGeoapify, respostaGeoapify } from '../apoio/geoapify-fixtures';

comBanco('Geoapify: HTTP e persistencia (integracao)', () => {
  let t: AppDeTeste;
  let ana: Conta;
  let bruno: Conta;
  let fetchMock: jest.SpyInstance;
  let destinoId: number;
  let atividadeId: number;

  beforeAll(async () => {
    t = await criarApp();
    await limparBanco(t.app);
    t.app.get(ConfigService).set('geoapify.apiKey', 'chave-ficticia');
    ana = await registrar(t.http, 'Ana', 'ana@teste.com');
    bruno = await registrar(t.http, 'Bruno', 'bruno@teste.com');
  });
  beforeEach(() => {
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(respostaGeoapify(atividadeGeoapify)));
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
  });

  it('protege as quatro rotas antes de gastar creditos', async () => {
    for (const path of [
      '/lugares/cidades?busca=Porto',
      '/lugares/atividades?latitude=41&longitude=-8',
    ]) {
      await t
        .http()
        .get('/api/v1' + path)
        .expect(401);
    }
    for (const path of ['/lugares/destinos/importar', '/lugares/atividades/importar']) {
      await t
        .http()
        .post('/api/v1' + path)
        .send({ idExterno: 'lugar' })
        .expect(401);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    '/lugares/cidades?busca=P',
    '/lugares/cidades?busca=Porto&pais=Portugal',
    '/lugares/cidades?busca=Porto&autocompletar=talvez',
    '/lugares/atividades?latitude=91&longitude=-8',
    '/lugares/atividades?latitude=41&longitude=-8&limite=21',
    '/lugares/atividades?latitude=41&longitude=-8&tipoAtividade=INVALIDO',
  ])('valida entrada: %s', async (url) => {
    await t
      .http()
      .get('/api/v1' + url)
      .set(bearer(ana.token))
      .expect(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('busca e autocompleta cidades com atribuicoes', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respostaGeoapify(cidadeGeoapify)));
    for (const suffix of ['', '&autocompletar=true']) {
      const { body } = await t
        .http()
        .get('/api/v1/lugares/cidades?busca=Porto&pais=pt' + suffix)
        .set(bearer(ana.token))
        .expect(200);
      expect(body[0]).toMatchObject({ nome: 'Porto', codigoPais: 'PT', fonte: 'geoapify' });
      expect(body[0].atribuicoes).toHaveLength(2);
    }
  });

  it('busca lugares e importa uma cidade, confirmando o ID canonico', async () => {
    await t
      .http()
      .get('/api/v1/lugares/atividades?latitude=41&longitude=-8')
      .set(bearer(ana.token))
      .expect(200);
    fetchMock.mockImplementation(() => Promise.resolve(respostaGeoapify(cidadeGeoapify)));
    const { body } = await t
      .http()
      .post('/api/v1/lugares/destinos/importar')
      .set(bearer(ana.token))
      .send({ idExterno: 'alias-cidade' })
      .expect(201);
    expect(body).toMatchObject({
      idExterno: 'cidade-canonica',
      fonte: 'geoapify',
      codigoPais: 'PT',
      criadoPor: ana.id,
    });
    destinoId = body.id;
    expect(body.atribuicoes).toHaveLength(2);
  });

  it('importacoes concorrentes reutilizam o mesmo item e preservam autor e foto', async () => {
    const respostas = await Promise.all(
      [ana, bruno, ana].map((conta) =>
        t
          .http()
          .post('/api/v1/lugares/atividades/importar')
          .set(bearer(conta.token))
          .send({ idExterno: 'alias-atividade' })
          .expect(201),
      ),
    );
    expect(new Set(respostas.map((r) => r.body.id)).size).toBe(1);
    const item = respostas[0].body;
    atividadeId = item.id;
    const autor = item.criadoPor === ana.id ? ana : bruno;
    await t
      .http()
      .patch(`/api/v1/atividades/${atividadeId}`)
      .set(bearer(autor.token))
      .send({ fotoUrl: 'https://foto.example/foto.png' })
      .expect(200);
    const { body } = await t
      .http()
      .post('/api/v1/lugares/atividades/importar')
      .set(bearer(ana.token))
      .send({ idExterno: 'atividade-canonica' })
      .expect(201);
    expect(body).toMatchObject({
      id: atividadeId,
      criadoPor: autor.id,
      fotoUrl: 'https://foto.example/foto.png',
    });
    expect(
      await t.app.get(PrismaService).catalogoAtividade.count({ where: { fonte: 'geoapify' } }),
    ).toBe(1);
  });

  it('propaga atribuicoes no catalogo, detalhes, destinos e atividades da viagem e mapa ISO', async () => {
    const { body: viagem } = await t
      .http()
      .post('/api/v1/viagens')
      .set(bearer(ana.token))
      .send({ nome: 'Porto' })
      .expect(201);
    const url = '/api/v1/viagens/' + viagem.id;
    const { body: destino } = await t
      .http()
      .post(url + '/destinos')
      .set(bearer(ana.token))
      .send({ destinoCatalogoId: destinoId })
      .expect(201);
    await t
      .http()
      .post(url + '/atividades')
      .set(bearer(ana.token))
      .send({ destinoViagemId: destino.id, catalogoAtividadeId: atividadeId, status: 'CONCLUIDA' })
      .expect(201);
    const { body: atvs } = await t
      .http()
      .get(url + '/atividades')
      .set(bearer(ana.token))
      .expect(200);
    expect(atvs[0].catalogoAtividade.atribuicoes).toHaveLength(2);
    expect(atvs[0].destinoViagem.destinoCatalogo.atribuicoes).toHaveLength(2);
    for (const path of [url, url + '/destinos']) {
      const { body } = await t.http().get(path).set(bearer(ana.token)).expect(200);
      const destinos = Array.isArray(body) ? body : body.destinos;
      expect(destinos[0].destinoCatalogo.atribuicoes).toHaveLength(2);
    }
    for (const path of [`/atividades/${atividadeId}`, `/destinos/${destinoId}`]) {
      const { body } = await t
        .http()
        .get('/api/v1' + path)
        .expect(200);
      expect(body.atribuicoes).toHaveLength(2);
    }
    await t.http().patch(url).set(bearer(ana.token)).send({ status: 'CONCLUIDA' }).expect(200);
    const { body: paises } = await t
      .http()
      .get('/api/v1/usuarios/eu/paises-visitados')
      .set(bearer(ana.token))
      .expect(200);
    expect(paises).toContainEqual({ codigo: 'PT', nome: 'Portugal', viagens: 1 });
  });

  it('recusa importar um ponto de interesse como cidade', async () => {
    const { body } = await t
      .http()
      .post('/api/v1/lugares/destinos/importar')
      .set(bearer(ana.token))
      .send({ idExterno: 'ponto-turistico' })
      .expect(400);
    expect(body.codigo).toBe('LUGAR_INVALIDO');
  });

  it('ID inexistente retorna 404 sem gravar e erro do fornecedor nao expoe a chave', async () => {
    fetchMock.mockResolvedValueOnce(respostaGeoapify({ features: [] }));
    const { body } = await t
      .http()
      .post('/api/v1/lugares/atividades/importar')
      .set(bearer(ana.token))
      .send({ idExterno: 'nao-existe' })
      .expect(404);
    expect(body.codigo).toBe('LUGAR_NAO_ENCONTRADO');
    fetchMock.mockRejectedValueOnce(new Error('apiKey=chave-ficticia'));
    const erro = await t
      .http()
      .get('/api/v1/lugares/cidades?busca=Paris')
      .set(bearer(ana.token))
      .expect(503);
    expect(JSON.stringify(erro.body)).not.toContain('chave-ficticia');
  });

  it('sem chave, o catalogo e a reimportacao de item ja salvo continuam funcionando', async () => {
    t.app.get(ConfigService).set('geoapify.apiKey', '');
    await t.http().get('/api/v1/lugares/cidades?busca=Recife').set(bearer(ana.token)).expect(503);
    await t.http().get(`/api/v1/atividades/${atividadeId}`).expect(200);
    const { body } = await t
      .http()
      .post('/api/v1/lugares/atividades/importar')
      .set(bearer(ana.token))
      .send({ idExterno: 'atividade-canonica' })
      .expect(201);
    expect(body.id).toBe(atividadeId);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
