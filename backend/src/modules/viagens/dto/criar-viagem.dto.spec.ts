import { BadRequestException } from '@nestjs/common';
import { criarPipeValidacao } from '../../../common/pipes/pipe-validacao';
import { AtualizarViagemDto } from './atualizar-viagem.dto';
import { CriarViagemDto } from './criar-viagem.dto';

/** Passa o corpo pelo mesmo pipe da aplicacao, como numa requisicao de verdade. */
const validar = (metatype: typeof CriarViagemDto | typeof AtualizarViagemDto, corpo: object) =>
  criarPipeValidacao().transform(corpo, { type: 'body', metatype });

const mensagensDoErro = (corpo: object) =>
  validar(CriarViagemDto, corpo).catch((erro: BadRequestException) => erro.getResponse());

describe('DTOs de viagem', () => {
  it('apara nome e descricao antes de gravar', async () => {
    const dto = await validar(CriarViagemDto, {
      nome: '  Eurotrip 2027  ',
      descricao: '  Roteiro de 15 dias  ',
    });

    expect(dto).toMatchObject({ nome: 'Eurotrip 2027', descricao: 'Roteiro de 15 dias' });
  });

  it('recusa nome so com espacos (RF04)', async () => {
    await expect(mensagensDoErro({ nome: '   ' })).resolves.toMatchObject({
      message: ['O nome da viagem nao pode ficar em branco'],
    });
  });

  it('trata descricao em branco como ausente', async () => {
    const dto = await validar(CriarViagemDto, { nome: 'Eurotrip', descricao: '   ' });

    expect(dto.descricao).toBeNull();
  });

  it('na edicao, nao inventa descricao para o campo omitido', async () => {
    const dto = await validar(AtualizarViagemDto, { status: 'CONFIRMADA' });

    // undefined mantem a descricao gravada; null a apagaria.
    expect(dto.descricao).toBeUndefined();
  });
});
