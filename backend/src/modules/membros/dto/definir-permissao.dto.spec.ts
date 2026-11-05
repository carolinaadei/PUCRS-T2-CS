import { PermissaoMembro } from '@prisma/client';
import { errosDoDto, validarDto } from '../../../../test/apoio/validar-dto';
import { DefinirPermissaoDto } from './definir-permissao.dto';

describe('DefinirPermissaoDto', () => {
  it.each([PermissaoMembro.EDITOR, PermissaoMembro.VISUALIZADOR])(
    'aceita %s',
    async (permissao) => {
      await expect(validarDto(DefinirPermissaoDto, { permissao })).resolves.toEqual({ permissao });
    },
  );

  it.each([{}, { permissao: '' }, { permissao: 'ADMIN' }, { permissao: null }])(
    'recusa permissao ausente ou fora dos niveis validos: %p',
    async (corpo) => {
      await expect(errosDoDto(DefinirPermissaoDto, corpo)).resolves.toEqual([
        { campo: 'permissao', mensagens: ['Permissao invalida: use EDITOR ou VISUALIZADOR'] },
      ]);
    },
  );

  it('recusa campo nao declarado, com a mensagem em portugues', async () => {
    await expect(
      errosDoDto(DefinirPermissaoDto, { permissao: PermissaoMembro.EDITOR, usuarioId: 99 }),
    ).resolves.toEqual([{ campo: 'usuarioId', mensagens: ['O campo usuarioId nao e permitido'] }]);
  });
});
