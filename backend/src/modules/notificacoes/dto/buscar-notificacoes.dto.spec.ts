import { BadRequestException } from '@nestjs/common';
import { criarPipeValidacao } from '../../../common/pipes/pipe-validacao';
import { BuscarNotificacoesDto } from './buscar-notificacoes.dto';

const validar = (query: object) =>
  criarPipeValidacao().transform(query, { type: 'query', metatype: BuscarNotificacoesDto });

const mensagensDoErro = (query: object) =>
  validar(query).catch((erro: BadRequestException) => erro.getResponse());

describe('BuscarNotificacoesDto', () => {
  it('usa os padroes de paginacao quando nenhum filtro e informado', async () => {
    const dto = (await validar({})) as BuscarNotificacoesDto;

    expect(dto.pagina).toBe(1);
    expect(dto.limite).toBe(20);
    expect(dto.apenasNaoLidas).toBeUndefined();
    expect(dto.pular).toBe(0);
  });

  it('converte apenasNaoLidas enviado como string "true" ou "false"', async () => {
    const verdadeiro = (await validar({ apenasNaoLidas: 'true' })) as BuscarNotificacoesDto;
    const falso = (await validar({ apenasNaoLidas: 'false' })) as BuscarNotificacoesDto;

    expect(verdadeiro.apenasNaoLidas).toBe(true);
    expect(falso.apenasNaoLidas).toBe(false);
  });

  it('aceita apenasNaoLidas booleano diretamente', async () => {
    const verdadeiro = (await validar({ apenasNaoLidas: true })) as BuscarNotificacoesDto;
    const falso = (await validar({ apenasNaoLidas: false })) as BuscarNotificacoesDto;

    expect(verdadeiro.apenasNaoLidas).toBe(true);
    expect(falso.apenasNaoLidas).toBe(false);
  });

  it('recusa valores invalidos para apenasNaoLidas com mensagem em portugues', async () => {
    await expect(mensagensDoErro({ apenasNaoLidas: 'talvez' })).resolves.toMatchObject({
      message: ['O filtro apenasNaoLidas deve ser verdadeiro ou falso'],
    });
  });

  it('valida os limites de paginacao herdados de PaginacaoDto', async () => {
    await expect(mensagensDoErro({ pagina: 0, limite: 500 })).resolves.toMatchObject({
      message: ['A pagina deve ser no minimo 1', 'O limite deve ser no maximo 100'],
    });
  });
});
