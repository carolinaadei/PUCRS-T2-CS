import { BadRequestException } from '@nestjs/common';
import { ErroDeCampo, criarPipeValidacao } from '../../src/common/pipes/pipe-validacao';

/** Passa o corpo pelo mesmo pipe da aplicacao, como numa requisicao de verdade. */
export const validarDto = <T>(
  metatype: new () => T,
  corpo: object,
  tipo: 'body' | 'query' = 'body',
) => criarPipeValidacao().transform(corpo, { type: tipo, metatype }) as Promise<T>;

/** Os `detalhes` do 400 de validacao; falha o teste se o corpo for aceito. */
export async function errosDoDto<T>(metatype: new () => T, corpo: object): Promise<ErroDeCampo[]> {
  try {
    await validarDto(metatype, corpo);
  } catch (erro) {
    const resposta = (erro as BadRequestException).getResponse() as { detalhes: ErroDeCampo[] };
    return resposta.detalhes;
  }

  throw new Error(`Esperava erro de validacao para ${JSON.stringify(corpo)}`);
}

/** Todas as mensagens, de todos os campos, numa lista so. */
export const mensagens = (detalhes: ErroDeCampo[]) => detalhes.flatMap((erro) => erro.mensagens);
