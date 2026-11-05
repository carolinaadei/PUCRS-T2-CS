import { errosDoDto, mensagens, validarDto } from '../../../../test/apoio/validar-dto';
import { BuscarNotificacoesDto } from './buscar-notificacoes.dto';

const validar = (query: object) => validarDto(BuscarNotificacoesDto, query, 'query');

describe('BuscarNotificacoesDto', () => {
  it('usa os padroes de paginacao quando nenhum filtro e informado', async () => {
    const dto = await validar({});

    expect(dto).toMatchObject({ pagina: 1, limite: 20, pular: 0 });
    expect(dto.apenasNaoLidas).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('converte apenasNaoLidas %p em %p', async (valor, esperado) => {
    expect((await validar({ apenasNaoLidas: valor })).apenasNaoLidas).toBe(esperado);
  });

  it('recusa valores invalidos com mensagem em portugues', async () => {
    expect(
      mensagens(await errosDoDto(BuscarNotificacoesDto, { apenasNaoLidas: 'talvez' })),
    ).toEqual(['O filtro apenasNaoLidas deve ser verdadeiro ou falso']);
  });

  it('valida os limites de paginacao herdados de PaginacaoDto', async () => {
    expect(mensagens(await errosDoDto(BuscarNotificacoesDto, { pagina: 0, limite: 500 }))).toEqual([
      'A pagina deve ser no minimo 1',
      'O limite deve ser no maximo 100',
    ]);
  });
});
