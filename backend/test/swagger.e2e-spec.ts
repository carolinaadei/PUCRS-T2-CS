import { OpenAPIObject } from '@nestjs/swagger';
import { criarDocumentoSwagger } from '../src/config/swagger';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppDeTeste, criarApp } from './apoio/app';

type Operacao = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
  responses: Record<string, unknown>;
};

/**
 * O contrato OpenAPI e o que o time do front le e de onde gera o cliente.
 * Estas regras garantem que ele continue utilizavel quando alguem acrescentar
 * uma rota sem olhar o resto.
 */
describe('Contrato OpenAPI (e2e)', () => {
  let t: AppDeTeste;
  let documento: OpenAPIObject;
  const urlOriginal = process.env.PUBLIC_URL;

  const operacoes = (): [string, string, Operacao][] =>
    Object.entries(documento.paths).flatMap(([caminho, item]) =>
      Object.entries(item as Record<string, Operacao>).map(
        ([metodo, operacao]) => [caminho, metodo, operacao] as [string, string, Operacao],
      ),
    );

  beforeAll(async () => {
    process.env.PUBLIC_URL = 'https://api.viajajunto.example/';
    t = await criarApp({
      ajustar: (builder) =>
        builder
          .overrideProvider(PrismaService)
          .useValue({ $connect: jest.fn(), $disconnect: jest.fn() }),
    });
    documento = criarDocumentoSwagger(t.app);
  });

  afterAll(async () => {
    process.env.PUBLIC_URL = urlOriginal;
    await t.app.close();
  });

  it('aponta o "Try it out" para a PUBLIC_URL, sem barra no fim', () => {
    expect(documento.servers).toEqual([
      { url: 'https://api.viajajunto.example', description: expect.any(String) },
    ]);
  });

  it('todas as rotas sao versionadas, exceto as sondas de saude', () => {
    for (const caminho of Object.keys(documento.paths)) {
      expect(caminho).toMatch(/^\/api\/(v1\/|health\/)/);
    }
  });

  it('operationId unico e em camelCase, para os clientes gerados', () => {
    const ids = operacoes().map(([, , operacao]) => operacao.operationId);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z][a-zA-Z0-9]+$/);
    }
    expect(ids).toContain('viagensCriar');
  });

  it('toda rota tem tag e resumo, sem codigos de requisito', () => {
    for (const [caminho, metodo, operacao] of operacoes()) {
      const rotulo = `${metodo.toUpperCase()} ${caminho}`;
      expect({ rotulo, tags: operacao.tags?.length }).toEqual({ rotulo, tags: 1 });
      expect({ rotulo, resumo: !!operacao.summary }).toEqual({ rotulo, resumo: true });
      expect(`${operacao.summary} ${operacao.description}`).not.toMatch(/\bR(N|F|NF)\d{2}\b/);
    }
  });

  it('rota protegida declara o bearer e o 401; publica nao', () => {
    const publicas = ['/api/v1/auth/login', '/api/v1/destinos', '/api/health/live'];

    for (const [caminho, metodo, operacao] of operacoes()) {
      const protegida = !!operacao.security?.length;
      if (publicas.includes(caminho) && metodo === 'get') {
        expect(protegida).toBe(false);
      }
      if (protegida) {
        expect(Object.keys(operacao.responses)).toContain('401');
      }
    }
  });

  it('nao publica rotas sem implementacao (501)', () => {
    for (const [, , operacao] of operacoes()) {
      expect(Object.keys(operacao.responses)).not.toContain('501');
    }
  });

  it('documenta o corpo de erro com o enum de codigos', () => {
    const esquema = documento.components?.schemas?.ErroRespostaDto as {
      properties: Record<string, { enum?: string[]; $ref?: string }>;
    };
    const codigo = esquema.properties.codigo;
    const enumDoCodigo =
      codigo.enum ??
      (documento.components?.schemas?.CodigoErro as { enum: string[] } | undefined)?.enum;

    expect(enumDoCodigo).toEqual(expect.arrayContaining(['VALIDACAO', 'VIAGEM_NAO_ENCONTRADA']));
    expect(Object.keys(esquema.properties)).toEqual(
      expect.arrayContaining(['statusCode', 'codigo', 'mensagem', 'requestId']),
    );
  });

  it('nenhuma resposta expoe campos internos do Prisma', () => {
    expect(JSON.stringify(documento.components?.schemas)).not.toContain('_count');
  });
});
