import { JwtService } from '@nestjs/jwt';
import { PermissaoMembro } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppDeTeste, bearer, criarApp } from './apoio/app';

/**
 * AcessoViagemGuard contra as regras de colaboracao: 404 para quem nao
 * participa, 403 com codigo proprio para quem participa sem permissao.
 * Prisma mockado: nao exige banco.
 */
describe('Acesso por viagem (e2e)', () => {
  const CRIADOR = { id: 1, email: 'criador@teste.com' };
  const VISUALIZADOR = { id: 2, email: 'visualizador@teste.com' };
  const EDITOR = { id: 3, email: 'editor@teste.com' };
  const ESTRANHO = { id: 4, email: 'estranho@teste.com' };

  let t: AppDeTeste;
  let jwt: JwtService;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    usuario: { findUnique: jest.fn() },
    viagem: { findUnique: jest.fn() },
    membroViagem: { findMany: jest.fn().mockResolvedValue([]) },
  };

  /** A viagem pertence ao CRIADOR; VISUALIZADOR e EDITOR sao colaboradores. */
  function como(usuario: { id: number; email: string }) {
    prisma.usuario.findUnique.mockResolvedValue({ ...usuario, nome: 'X', versaoSessao: 0 });
    const permissao =
      usuario === VISUALIZADOR
        ? PermissaoMembro.VISUALIZADOR
        : usuario === EDITOR
          ? PermissaoMembro.EDITOR
          : undefined;
    prisma.viagem.findUnique.mockResolvedValue({
      id: 'DEMO2027',
      criadoPor: CRIADOR.id,
      membros: permissao ? [{ permissao }] : [],
    });
    return bearer(jwt.sign({ sub: usuario.id, email: usuario.email, ver: 0 }));
  }

  beforeAll(async () => {
    t = await criarApp({
      ajustar: (builder) => builder.overrideProvider(PrismaService).useValue(prisma),
    });
    jwt = t.app.get(JwtService);
  });

  afterAll(() => t.app.close());

  it('quem nao participa recebe 404 VIAGEM_NAO_ENCONTRADA, nao 403', async () => {
    const { body } = await t
      .http()
      .get('/api/v1/viagens/DEMO2027/membros')
      .set(como(ESTRANHO))
      .expect(404);

    expect(body.codigo).toBe('VIAGEM_NAO_ENCONTRADA');
  });

  it('viagem inexistente responde igual a viagem alheia', async () => {
    const cabecalho = como(CRIADOR);
    prisma.viagem.findUnique.mockResolvedValueOnce(null);

    const { body } = await t
      .http()
      .get('/api/v1/viagens/NAOEXIST/membros')
      .set(cabecalho)
      .expect(404);
    expect(body.codigo).toBe('VIAGEM_NAO_ENCONTRADA');
  });

  it('qualquer participante le', async () => {
    for (const usuario of [CRIADOR, EDITOR, VISUALIZADOR]) {
      await t.http().get('/api/v1/viagens/DEMO2027/membros').set(como(usuario)).expect(200);
    }
  });

  it('VISUALIZADOR nao escreve: SOMENTE_LEITURA', async () => {
    const { body } = await t
      .http()
      .put('/api/v1/viagens/DEMO2027/orcamento')
      .set(como(VISUALIZADOR))
      .send({ valorTotal: 100 })
      .expect(403);

    expect(body.codigo).toBe('SOMENTE_LEITURA');
  });

  it('EDITOR nao faz o que e do criador: APENAS_CRIADOR', async () => {
    for (const [metodo, caminho] of [
      ['delete', '/api/v1/viagens/DEMO2027'],
      ['post', '/api/v1/viagens/DEMO2027/convite'],
      ['patch', '/api/v1/viagens/DEMO2027/membros/1'],
    ] as const) {
      const { body } = await t
        .http()
        [metodo](caminho)
        .set(como(EDITOR))
        .send({ permissao: 'EDITOR' })
        .expect(403);
      expect(body.codigo).toBe('APENAS_CRIADOR');
    }
  });
});
