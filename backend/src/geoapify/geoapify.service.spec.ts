import { ConfigService } from '@nestjs/config';
import { TipoAtividade } from '@prisma/client';
import {
  atividadeGeoapify,
  cidadeGeoapify,
  respostaGeoapify,
} from '../../test/apoio/geoapify-fixtures';
import { PrismaService } from '../prisma/prisma.service';
import { BuscarCidadesDto, BuscarLugaresDto } from './geoapify.dto';
import { GeoapifyService } from './geoapify.service';

describe('GeoapifyService', () => {
  let service: GeoapifyService;
  let fetchMock: jest.SpyInstance;
  const config = { get: jest.fn() };
  const cidades = () => Object.assign(new BuscarCidadesDto(), { busca: 'Porto', pais: 'PT' });

  beforeEach(() => {
    config.get.mockReturnValue('chave-de-teste');
    service = new GeoapifyService(config as unknown as ConfigService, {} as PrismaService);
    fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementation(() => Promise.resolve(respostaGeoapify(cidadeGeoapify)));
  });
  afterEach(() => jest.restoreAllMocks());

  it('sem chave nao faz chamada externa e retorna erro de configuracao', async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.cidades(cidades())).rejects.toMatchObject({
      response: { codigo: 'GEOAPIFY_INDISPONIVEL' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza geocodificacao com ISO, coordenadas e creditos sem expor a chave', async () => {
    const resposta = await service.cidades(cidades());
    expect(resposta[0]).toMatchObject({
      fonte: 'geoapify',
      nome: 'Porto',
      codigoPais: 'PT',
      ehCidade: true,
      latitude: 41.1496,
      longitude: -8.6109,
    });
    expect(resposta[0].atribuicoes).toHaveLength(2);
    expect(JSON.stringify(resposta)).not.toContain('chave-de-teste');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/v1/geocode/search');
    expect(url.searchParams.get('filter')).toBe('countrycode:pt');
    expect(url.searchParams.get('lang')).toBe('pt');
  });

  it('autocompletar usa o endpoint correspondente', async () => {
    await service.cidades({ ...cidades(), autocompletar: 'true' });
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe('/v1/geocode/autocomplete');
  });

  it.each([
    [TipoAtividade.PASSEIO, 'tourism'],
    [TipoAtividade.REFEICAO, 'catering'],
    [TipoAtividade.HOSPEDAGEM, 'accommodation'],
    [TipoAtividade.TRANSPORTE, 'public_transport'],
    [TipoAtividade.OUTRO, 'leisure'],
  ])(
    'consulta %s com categoria %s e longitude antes da latitude',
    async (tipoAtividade, categoria) => {
      await service.atividades(
        Object.assign(new BuscarLugaresDto(), { latitude: 41.1, longitude: -8.6, tipoAtividade }),
      );
      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.searchParams.get('categories')).toBe(categoria);
      expect(url.searchParams.get('filter')).toBe('circle:-8.6,41.1,5000');
      expect(url.searchParams.get('limit')).toBe('20');
    },
  );

  it('cache expira e as respostas em cache nao podem ser alteradas pelo consumidor', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const a = await service.cidades(cidades());
    a[0].nome = 'alterado';
    expect((await service.cidades(cidades()))[0].nome).toBe('Porto');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    now.mockReturnValue(302000);
    await service.cidades(cidades());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [429, 'GEOAPIFY_LIMITE'],
    [401, 'GEOAPIFY_INDISPONIVEL'],
    [500, 'GEOAPIFY_INDISPONIVEL'],
  ])('trata HTTP %s sem propagar dados do fornecedor', async (status, codigo) => {
    fetchMock.mockResolvedValue(respostaGeoapify({ message: 'chave-de-teste' }, status));
    await expect(service.cidades(cidades())).rejects.toMatchObject({ response: { codigo } });
  });

  it('erro de rede contendo a URL secreta e substituido por mensagem segura', async () => {
    fetchMock.mockRejectedValue(new Error('https://api.geoapify.com/?apiKey=chave-de-teste'));
    try {
      await service.cidades(cidades());
      fail('deveria falhar');
    } catch (erro) {
      expect(String(erro)).not.toContain('chave-de-teste');
      expect(erro).toMatchObject({ response: { codigo: 'GEOAPIFY_INDISPONIVEL' } });
    }
  });

  it('rejeita envelope invalido e nao guarda erros no cache', async () => {
    fetchMock.mockResolvedValueOnce(respostaGeoapify({ resultados: [] }));
    await expect(service.cidades(cidades())).rejects.toMatchObject({
      response: { codigo: 'GEOAPIFY_INDISPONIVEL' },
    });
    expect(await service.cidades(cidades())).toHaveLength(1);
  });

  it('ignora lugares sem coordenadas ou identificador e preserva creditos adicionais', async () => {
    const f = structuredClone(atividadeGeoapify.features[0]);
    f.properties.datasource = { attribution: 'Outra fonte', url: 'https://fonte.example/' };
    fetchMock.mockResolvedValue(
      respostaGeoapify({
        features: [{ properties: {} }, { properties: { ...f.properties, lat: 999 } }, f],
      }),
    );
    const itens = await service.cidades(cidades());
    expect(itens).toHaveLength(1);
    expect(itens[0].atribuicoes).toHaveLength(3);
    expect(itens[0].tipoAtividade).toBe('PASSEIO');
  });
});
