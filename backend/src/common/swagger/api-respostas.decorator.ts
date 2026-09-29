import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { NivelAcessoViagem } from '../decorators/nivel-acesso.decorator';
import { ErroRespostaDto } from './erro-resposta.dto';

const NOME_DO_STATUS: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  429: 'Too Many Requests',
  501: 'Not Implemented',
};

/**
 * Documenta uma resposta de erro com o corpo padrao do Nest. A `descricao`
 * aparece na lista de respostas; `mensagem` e o `message` do exemplo.
 */
export const ApiErro = (
  status: number,
  descricao: string,
  mensagem: string | string[] = descricao,
) =>
  ApiResponse({
    status,
    description: descricao,
    type: ErroRespostaDto,
    example: { statusCode: status, message: mensagem, error: NOME_DO_STATUS[status] },
  });

/** 400 da validacao do corpo ou da query, com exemplos das mensagens por campo. */
export const ApiErroValidacao = (...mensagens: string[]) =>
  ApiErro(400, 'Dados invalidos: campo ausente, fora do formato ou nao declarado', mensagens);

/** Rota que exige `Authorization: Bearer <token>` (JwtAuthGuard global). */
export const ApiAutenticado = () =>
  applyDecorators(
    ApiBearerAuth(),
    ApiErro(401, 'Token ausente, invalido, expirado ou revogado', 'Unauthorized'),
  );

/** Parametro `:viagemId`, que e tambem o codigo de convite da viagem. */
export const ApiParamViagem = () =>
  ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' });

const MOTIVO_403: Partial<Record<NivelAcessoViagem, string>> = {
  [NivelAcessoViagem.EDITOR]: 'Seu nivel de permissao nesta viagem e somente leitura',
  [NivelAcessoViagem.CRIADOR]: 'Apenas o criador da viagem pode executar esta acao',
};

/**
 * Respostas do AcessoViagemGuard para o nivel exigido em `@NivelAcesso`: 404
 * para quem nao participa (RN06) e 403 para quem participa sem permissao.
 * `outroNaoEncontrado` descreve outro 404 possivel na mesma rota.
 */
export const ApiAcessoViagem = (nivel: NivelAcessoViagem, outroNaoEncontrado?: string) => {
  const naoEncontrada = 'Viagem nao encontrada ou voce nao participa dela (RN06)';
  const decoradores = [
    ApiErro(
      404,
      outroNaoEncontrado ? `${naoEncontrada}; ou ${outroNaoEncontrado}` : naoEncontrada,
      'Viagem A3KD9F2P nao encontrada',
    ),
  ];

  const motivo403 = MOTIVO_403[nivel];
  if (motivo403) {
    decoradores.push(ApiErro(403, motivo403));
  }

  return applyDecorators(...decoradores);
};

/** Rota com contrato definido, mas ainda sem implementacao: responde 501. */
export const ApiNaoImplementado = () =>
  ApiErro(501, 'Ainda nao implementado: o contrato acima e o planejado');
