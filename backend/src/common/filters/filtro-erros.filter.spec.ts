import { ArgumentsHost, ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { CodigoErro } from '../erros/codigos-erro';
import { conflito, requisicaoInvalida } from '../erros/erros';
import { FiltroErros } from './filtro-erros.filter';

/** Executa o filtro e devolve o que ele mandaria ao cliente. */
function responder(excecao: unknown) {
  const resposta = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const requisicao = { id: 'req-1', method: 'GET', originalUrl: '/api/v1/viagens/X?y=1' };
  const host = {
    switchToHttp: () => ({ getRequest: () => requisicao, getResponse: () => resposta }),
  } as unknown as ArgumentsHost;

  new FiltroErros().catch(excecao, host);

  return {
    status: resposta.status.mock.calls[0][0] as number,
    corpo: resposta.json.mock.calls[0][0] as Record<string, unknown>,
  };
}

const prisma = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('erro do banco com detalhe interno', {
    code,
    clientVersion: '6',
    meta: { target: ['email'] },
  });

describe('FiltroErros', () => {
  it('monta o corpo padrao com codigo, request id, caminho e horario', () => {
    const { status, corpo } = responder(
      conflito(CodigoErro.JA_PARTICIPA, 'Voce ja participa desta viagem'),
    );

    expect(status).toBe(409);
    expect(corpo).toEqual({
      statusCode: 409,
      codigo: 'JA_PARTICIPA',
      mensagem: 'Voce ja participa desta viagem',
      requestId: 'req-1',
      caminho: '/api/v1/viagens/X?y=1',
      timestamp: expect.any(String),
    });
  });

  it('inclui os detalhes quando a excecao os traz', () => {
    const detalhes = [{ campo: 'nome', mensagens: ['obrigatorio'] }];
    const { corpo } = responder(
      requisicaoInvalida(CodigoErro.VALIDACAO, 'Dados invalidos', detalhes),
    );

    expect(corpo.detalhes).toBe(detalhes);
  });

  it('da codigo e texto em portugues as excecoes que vem do framework', () => {
    expect(responder(new ForbiddenException()).corpo).toMatchObject({
      codigo: 'PROIBIDO',
      mensagem: 'Voce nao tem permissao para esta operacao',
    });
    expect(responder(new ThrottlerException()).corpo).toMatchObject({
      codigo: 'MUITAS_REQUISICOES',
    });
  });

  it('reconhece rota inexistente pela mensagem do roteador', () => {
    const { corpo } = responder(new NotFoundException('Cannot GET /api/v1/viagens/X'));

    expect(corpo).toMatchObject({
      codigo: 'ROTA_NAO_ENCONTRADA',
      mensagem: 'Rota nao encontrada: GET /api/v1/viagens/X',
    });
  });

  it.each([
    ['P2002', HttpStatus.CONFLICT, 'REGISTRO_DUPLICADO'],
    ['P2003', HttpStatus.CONFLICT, 'REGISTRO_EM_USO'],
    ['P2025', HttpStatus.NOT_FOUND, 'NAO_ENCONTRADO'],
    ['P2034', HttpStatus.INTERNAL_SERVER_ERROR, 'ERRO_INTERNO'],
  ])('traduz o erro %s do Prisma sem vazar o detalhe do banco', (code, status, codigo) => {
    const resposta = responder(prisma(code));

    expect(resposta).toMatchObject({ status, corpo: { codigo } });
    expect(JSON.stringify(resposta.corpo)).not.toMatch(/email|detalhe interno/);
  });

  it.each([
    [413, 'CORPO_GRANDE_DEMAIS'],
    [415, 'CORPO_INVALIDO'],
    [400, 'CORPO_INVALIDO'],
  ])('preserva o status %p dos erros do body-parser', (status, codigo) => {
    // Formato do http-errors: status e `expose`, que ele liga em todo 4xx.
    expect(responder({ status, expose: true, type: 'qualquer' })).toMatchObject({
      status,
      corpo: { codigo },
    });
  });

  it('erro com status mas sem `expose` nao e de cliente: vira 500', () => {
    expect(responder({ status: 400 }).status).toBe(500);
    expect(responder({ status: 502, expose: true }).status).toBe(500);
  });

  it('esconde qualquer falha inesperada atras de um 500 generico', () => {
    const { status, corpo } = responder(new TypeError('cannot read x of undefined'));

    expect(status).toBe(500);
    expect(corpo).toMatchObject({ codigo: 'ERRO_INTERNO' });
    expect(JSON.stringify(corpo)).not.toContain('undefined');
  });
});
