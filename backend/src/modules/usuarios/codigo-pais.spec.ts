import { resolverPaisIso } from './codigo-pais';

describe('resolverPaisIso', () => {
  it.each([
    ['Brasil', 'BR'],
    ['brasil', 'BR'],
    ['Japão', 'JP'],
    ['Germany', 'DE'],
    ['EUA', 'US'],
    ['Reino Unido', 'GB'],
    ['uk', 'GB'],
    ['Russia', 'RU'],
    ['pt', 'PT'],
  ])('%p vira %p', (pais, codigo) => {
    expect(resolverPaisIso(pais)?.codigo).toBe(codigo);
  });

  it('sigla devolve o nome em portugues; nome devolve o que foi digitado', () => {
    expect(resolverPaisIso('pt')).toEqual({ codigo: 'PT', nome: 'Portugal' });
    expect(resolverPaisIso('  Brasil ')).toEqual({ codigo: 'BR', nome: 'Brasil' });
  });

  it.each([null, undefined, '', '   ', 'Atlantida', 'ZZ'])('nao reconhece %p', (pais) => {
    expect(resolverPaisIso(pais)).toBeNull();
  });
});
