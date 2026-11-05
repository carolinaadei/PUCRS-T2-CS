import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { gerarCodigo, normalizarCodigo, TAMANHO_CODIGO } from './codigo';
import { deDia, paraDia, paraDinheiro } from './formatos';

describe('formatos', () => {
  it('deDia grava meia-noite UTC do dia informado', () => {
    expect(deDia('2027-01-10', 'inicio').toISOString()).toBe('2027-01-10T00:00:00.000Z');
  });

  it.each(['2027-02-31', '2027-13-01', '10/01/2027', '2027-1-1'])(
    'deDia recusa %p com DATA_INEXISTENTE',
    (valor) => {
      expect(() => deDia(valor, 'inicio')).toThrow(BadRequestException);
      try {
        deDia(valor, 'inicio');
      } catch (erro) {
        expect((erro as BadRequestException).getResponse()).toMatchObject({
          codigo: 'DATA_INEXISTENTE',
        });
      }
    },
  );

  it('paraDia devolve aaaa-mm-dd ou null', () => {
    expect(paraDia(new Date('2027-01-10T00:00:00.000Z'))).toBe('2027-01-10');
    expect(paraDia(null)).toBeNull();
    expect(paraDia(undefined)).toBeNull();
  });

  it('paraDinheiro sempre com duas casas, sem perder centavos', () => {
    expect(paraDinheiro(new Prisma.Decimal('1250.5'))).toBe('1250.50');
    expect(paraDinheiro(0.1 + 0.2)).toBe('0.30');
    expect(paraDinheiro(12000)).toBe('12000.00');
    expect(paraDinheiro(null)).toBeNull();
  });
});

describe('codigo de convite', () => {
  it('gera codigos do alfabeto sem caracteres ambiguos', () => {
    const codigos = Array.from({ length: 200 }, () => gerarCodigo());

    for (const codigo of codigos) {
      expect(codigo).toMatch(new RegExp(`^[A-HJ-NP-Z2-9]{${TAMANHO_CODIGO}}$`));
    }
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('normaliza o que o usuario digitou', () => {
    expect(normalizarCodigo('  k7m2q9xa ')).toBe('K7M2Q9XA');
  });
});
