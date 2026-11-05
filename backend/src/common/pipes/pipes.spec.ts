import { ArgumentMetadata, BadRequestException, ValidationError } from '@nestjs/common';
import { ParseIdOpcionalPipe, ParseIdPipe } from './parse-id.pipe';
import { achatarErros } from './pipe-validacao';

const metadados: ArgumentMetadata = { type: 'param', data: 'destinoId' };

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
  ])('converte %p', (valor, esperado) => {
    expect(pipe.transform(valor, metadados)).toBe(esperado);
  });

  it.each(['0', '-1', '1.5', 'abc', '', '2147483648', ' 1'])(
    'recusa %p com ID_INVALIDO',
    (valor) => {
      try {
        pipe.transform(valor, metadados);
        throw new Error('deveria ter recusado');
      } catch (erro) {
        expect(erro).toBeInstanceOf(BadRequestException);
        expect((erro as BadRequestException).getResponse()).toEqual({
          codigo: 'ID_INVALIDO',
          message: 'O parametro destinoId deve ser um numero inteiro positivo',
        });
      }
    },
  );

  it('a variante opcional deixa passar o ausente', () => {
    const opcional = new ParseIdOpcionalPipe();

    expect(opcional.transform(undefined, metadados)).toBeUndefined();
    expect(opcional.transform('', metadados)).toBeUndefined();
    expect(opcional.transform('7', metadados)).toBe(7);
    expect(() => opcional.transform('x', metadados)).toThrow(BadRequestException);
  });
});

describe('achatarErros', () => {
  it('lista cada campo com o caminho completo, inclusive aninhados', () => {
    const erros = [
      { property: 'nome', constraints: { isNotEmpty: 'O nome e obrigatorio' }, children: [] },
      {
        property: 'destinos',
        children: [
          {
            property: '0',
            children: [
              { property: 'ordem', constraints: { min: 'A ordem nao pode ser negativa' } },
            ],
          },
        ],
      },
      {
        property: 'admin',
        constraints: { whitelistValidation: 'property admin should not exist' },
      },
    ] as ValidationError[];

    expect(achatarErros(erros)).toEqual([
      { campo: 'nome', mensagens: ['O nome e obrigatorio'] },
      { campo: 'destinos.0.ordem', mensagens: ['A ordem nao pode ser negativa'] },
      { campo: 'admin', mensagens: ['O campo admin nao e permitido'] },
    ]);
  });
});
