import { BadRequestException } from '@nestjs/common';
import { criarPipeValidacao } from '../../../common/pipes/pipe-validacao';
import { DefinirOrcamentoDto } from './definir-orcamento.dto';

/** Passa o corpo pelo mesmo pipe da aplicacao, como numa requisicao de verdade. */
const validar = (corpo: object) =>
  criarPipeValidacao().transform(corpo, { type: 'body', metatype: DefinirOrcamentoDto });

const mensagensDoErro = (corpo: object) =>
  validar(corpo).catch((erro: BadRequestException) => erro.getResponse());

describe('DefinirOrcamentoDto (RF15)', () => {
  it('aceita valor com centavos', async () => {
    await expect(validar({ valorTotal: 12000.5 })).resolves.toEqual({ valorTotal: 12000.5 });
  });

  it('converte o valor enviado como texto', async () => {
    await expect(validar({ valorTotal: '850.75' })).resolves.toEqual({ valorTotal: 850.75 });
  });

  it('aceita o maior valor que cabe na coluna Decimal(10,2)', async () => {
    await expect(validar({ valorTotal: 99999999.99 })).resolves.toEqual({
      valorTotal: 99999999.99,
    });
  });

  it.each([0, -100])(
    'recusa orcamento %p, que nao serve de base para os percentuais',
    async (valorTotal) => {
      await expect(mensagensDoErro({ valorTotal })).resolves.toMatchObject({
        message: ['O orcamento total deve ser maior que zero'],
      });
    },
  );

  it('recusa mais de duas casas decimais', async () => {
    await expect(mensagensDoErro({ valorTotal: 10.999 })).resolves.toMatchObject({
      message: [
        'Informe o orcamento total como um numero com ate duas casas decimais (ex.: 12000.50)',
      ],
    });
  });

  it('recusa valor acima do que o banco consegue gravar, em vez de deixar virar 500', async () => {
    await expect(mensagensDoErro({ valorTotal: 100_000_000 })).resolves.toMatchObject({
      message: ['O orcamento total deve ser de no maximo 99999999.99'],
    });
  });

  it.each([{}, { valorTotal: 'muito' }, { valorTotal: null }])(
    'explica o formato quando o valor falta ou nao e numero: %p',
    async (corpo) => {
      const { message } = (await mensagensDoErro(corpo)) as { message: string[] };

      expect(message).toContain(
        'Informe o orcamento total como um numero com ate duas casas decimais (ex.: 12000.50)',
      );
    },
  );

  it('recusa campos que nao fazem parte do orcamento', async () => {
    await expect(
      mensagensDoErro({ valorTotal: 1000, previstoAtividades: 50 }),
    ).resolves.toMatchObject({ message: ['property previstoAtividades should not exist'] });
  });
});
