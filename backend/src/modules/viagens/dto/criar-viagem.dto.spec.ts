import { errosDoDto, mensagens, validarDto } from '../../../../test/apoio/validar-dto';
import { AtualizarViagemDto, CriarViagemDto } from './criar-viagem.dto';

describe('DTOs de viagem', () => {
  it('apara nome e descricao; descricao em branco vira null', async () => {
    await expect(
      validarDto(CriarViagemDto, { nome: '  Eurotrip  ', descricao: '  Quinze dias  ' }),
    ).resolves.toMatchObject({ nome: 'Eurotrip', descricao: 'Quinze dias' });

    expect(
      (await validarDto(CriarViagemDto, { nome: 'X', descricao: '   ' })).descricao,
    ).toBeNull();
  });

  it('recusa nome so com espacos', async () => {
    expect(mensagens(await errosDoDto(CriarViagemDto, { nome: '   ' }))).toEqual([
      'O nome da viagem nao pode ficar em branco',
    ]);
  });

  it('explica o formato de data e os status aceitos', async () => {
    expect(
      mensagens(
        await errosDoDto(CriarViagemDto, { nome: 'X', dataInicio: '10/01/2027', status: 'ATIVA' }),
      ),
    ).toEqual([
      'Informe a data de inicio no formato aaaa-mm-dd (ex.: 2027-01-10)',
      'Status invalido: use EM_PLANEJAMENTO, CONFIRMADA, CONCLUIDA',
    ]);
  });

  it('na edicao, campo omitido fica undefined (mantem) e null fica null (apaga)', async () => {
    const dto = await validarDto(AtualizarViagemDto, { status: 'CONFIRMADA', dataFim: null });

    expect(dto.descricao).toBeUndefined();
    expect(dto.dataFim).toBeNull();
  });

  it('na edicao, nome e status nao aceitam null', async () => {
    const erros = await errosDoDto(AtualizarViagemDto, { nome: null, status: null });

    expect(erros.map((erro) => erro.campo).sort()).toEqual(['nome', 'status']);
  });
});
