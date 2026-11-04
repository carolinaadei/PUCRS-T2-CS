import { BadRequestException } from '@nestjs/common';
import { PermissaoMembro } from '@prisma/client';
import { criarPipeValidacao } from '../../../common/pipes/pipe-validacao';
import { DefinirPermissaoDto } from './definir-permissao.dto';

/** Passa o corpo pelo mesmo pipe da aplicacao, como numa requisicao de verdade. */
const validar = (corpo: object) =>
  criarPipeValidacao().transform(corpo, { type: 'body', metatype: DefinirPermissaoDto });

const mensagensDoErro = (corpo: object) =>
  validar(corpo).catch((erro: BadRequestException) => erro.getResponse());

describe('DefinirPermissaoDto', () => {
  it.each([PermissaoMembro.EDITOR, PermissaoMembro.VISUALIZADOR])(
    'aceita o nivel de permissao %s',
    async (permissao) => {
      await expect(validar({ permissao })).resolves.toEqual({ permissao });
    },
  );

  it.each([{}, { permissao: '' }, { permissao: 'ADMIN' }, { permissao: null }])(
    'recusa permissao ausente ou fora dos niveis validos: %p',
    async (corpo) => {
      await expect(mensagensDoErro(corpo)).resolves.toMatchObject({
        message: ['Permissao invalida: use EDITOR ou VISUALIZADOR'],
      });
    },
  );

  it('recusa campos nao declarados no DTO', async () => {
    await expect(
      mensagensDoErro({ permissao: PermissaoMembro.EDITOR, usuarioId: 99 }),
    ).resolves.toMatchObject({
      message: ['property usuarioId should not exist'],
    });
  });
});
