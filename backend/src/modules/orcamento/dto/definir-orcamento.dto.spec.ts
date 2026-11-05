import { errosDoDto, mensagens, validarDto } from '../../../../test/apoio/validar-dto';
import { DefinirOrcamentoDto } from './definir-orcamento.dto';

describe('DefinirOrcamentoDto', () => {
  it('aceita valor com centavos e converte o enviado como texto', async () => {
    await expect(validarDto(DefinirOrcamentoDto, { valorTotal: 12000.5 })).resolves.toEqual({
      valorTotal: 12000.5,
    });
    await expect(validarDto(DefinirOrcamentoDto, { valorTotal: '850.75' })).resolves.toEqual({
      valorTotal: 850.75,
    });
  });

  it('aceita o maior valor que cabe na coluna Decimal(10,2) e recusa o seguinte', async () => {
    await expect(
      validarDto(DefinirOrcamentoDto, { valorTotal: 99999999.99 }),
    ).resolves.toBeDefined();
    expect(mensagens(await errosDoDto(DefinirOrcamentoDto, { valorTotal: 100000000 }))).toEqual([
      'O orcamento total deve ser de no maximo 99999999.99',
    ]);
  });

  it.each([0, -100])('recusa %p, que nao serve de base para os percentuais', async (valorTotal) => {
    expect(mensagens(await errosDoDto(DefinirOrcamentoDto, { valorTotal }))).toEqual([
      'O orcamento total deve ser maior que zero',
    ]);
  });

  it('recusa mais de duas casas decimais', async () => {
    expect(mensagens(await errosDoDto(DefinirOrcamentoDto, { valorTotal: 10.123 }))).toEqual([
      'Informe o orcamento total como um numero com ate duas casas decimais (ex.: 12000.50)',
    ]);
  });
});
