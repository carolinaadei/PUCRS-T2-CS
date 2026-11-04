import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { NivelAcessoViagem } from '../decorators/nivel-acesso.decorator';
import { CodigoErro } from '../erros/codigos-erro';
import { ErroRespostaDto } from './erro-resposta.dto';

const exemplo = (status: number, codigo: CodigoErro, mensagem: string, detalhes?: unknown) => ({
  statusCode: status,
  codigo,
  mensagem,
  ...(detalhes !== undefined && { detalhes }),
  requestId: '6f1c2b7e-1a4d-4c1e-9a8f-0d2b3c4e5f60',
  caminho: '/api/v1/...',
  timestamp: '2027-01-10T12:00:00.000Z',
});

/**
 * Documenta uma resposta de erro. Varios codigos no mesmo status entram juntos
 * na descricao, e o primeiro vira o exemplo.
 */
export const ApiErro = (status: number, codigos: CodigoErro | CodigoErro[], descricao: string) => {
  const lista = Array.isArray(codigos) ? codigos : [codigos];

  return ApiResponse({
    status,
    description: `${descricao} (${lista.map((codigo) => `\`${codigo}\``).join(', ')})`,
    type: ErroRespostaDto,
    example: exemplo(status, lista[0], descricao),
  });
};

/** 400 da validacao do corpo, da query ou de um parametro de rota. */
export const ApiErroValidacao = (...mensagens: string[]) =>
  ApiResponse({
    status: 400,
    description: 'Dados invalidos: campo ausente, fora do formato ou nao declarado (`VALIDACAO`)',
    type: ErroRespostaDto,
    example: exemplo(400, CodigoErro.VALIDACAO, 'Dados invalidos', [
      { campo: 'campo', mensagens: mensagens.length > 0 ? mensagens : ['Mensagem do campo'] },
    ]),
  });

/** Rota que exige `Authorization: Bearer <accessToken>` (JwtAuthGuard global). */
export const ApiAutenticado = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiErro(
      401,
      [CodigoErro.NAO_AUTENTICADO, CodigoErro.SESSAO_ENCERRADA],
      'Token ausente, invalido, expirado ou revogado',
    ),
  );

/** Parametro `:viagemId`. */
export const ApiParamViagem = () =>
  ApiParam({ name: 'viagemId', description: 'Id da viagem', example: 'DEMO2027' });

/** Parametro numerico de rota, validado pelo ParseIdPipe. */
export const ApiParamId = (nome: string, descricao: string) =>
  ApiParam({ name: nome, type: Number, description: descricao, example: 1 });

const MOTIVO_403: Partial<Record<NivelAcessoViagem, [CodigoErro, string]>> = {
  [NivelAcessoViagem.EDITOR]: [
    CodigoErro.SOMENTE_LEITURA,
    'Seu nivel de permissao nesta viagem e somente leitura',
  ],
  [NivelAcessoViagem.CRIADOR]: [
    CodigoErro.APENAS_CRIADOR,
    'Apenas o criador da viagem pode executar esta acao',
  ],
};

/**
 * Respostas do AcessoViagemGuard para o nivel exigido em `@NivelAcesso`: 404
 * para quem nao participa e 403 para quem participa sem a permissao. `outros404`
 * acrescenta os demais "nao encontrado" possiveis na mesma rota.
 */
export const ApiAcessoViagem = (nivel: NivelAcessoViagem, outros404: CodigoErro[] = []) => {
  const decoradores = [
    ApiErro(
      404,
      [CodigoErro.VIAGEM_NAO_ENCONTRADA, ...outros404],
      'Viagem nao encontrada (ou voce nao participa dela) ou item inexistente nela',
    ),
  ];

  const motivo403 = MOTIVO_403[nivel];
  if (motivo403) {
    decoradores.push(ApiErro(403, motivo403[0], motivo403[1]));
  }

  return applyDecorators(...decoradores);
};
