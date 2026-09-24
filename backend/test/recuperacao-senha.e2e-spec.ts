import { INestApplication } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { criarPipeValidacao } from '../src/common/pipes/pipe-validacao';
import { AppModule } from '../src/app.module';
import { MailService } from '../src/modules/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * RF03 de ponta a ponta: as tres etapas da recuperacao de senha sobre HTTP.
 * Os casos de concorrencia ficam no teste unitario do AuthService; aqui o foco
 * e o contrato das rotas, os status codes e o efeito final no usuario.
 */

const EMAIL = 'ana@example.com';
const SENHA_ANTIGA = 'senha-antiga-123';
const SENHA_NOVA = 'senha-nova-456';

type Dados = Record<string, unknown>;

interface Registro {
  id: number;
  usuarioId: number;
  codigoHash: string;
  tentativas: number;
  expiraEm: Date;
  verificadoEm: Date | null;
  trocaHash: string | null;
  trocaExpiraEm: Date | null;
  usadoEm: Date | null;
  criadoEm: Date;
}

const numero = (valor: unknown) => (valor instanceof Date ? valor.getTime() : (valor as number));

/** Aplica um `where` do Prisma, inclusive `lt`, `gt` e `gte`. */
const atende = (registro: Registro, where: Dados) =>
  Object.entries(where).every(([campo, condicao]) => {
    const valor = registro[campo as keyof Registro];

    if (condicao === null || typeof condicao !== 'object' || condicao instanceof Date) {
      return valor === condicao;
    }

    const { lt, gt, gte } = condicao as { lt?: number | Date; gt?: number | Date; gte?: number };
    return (
      valor !== null &&
      (lt === undefined || numero(valor) < numero(lt)) &&
      (gt === undefined || numero(valor) > numero(gt)) &&
      (gte === undefined || numero(valor) >= numero(gte))
    );
  });

/** Aplica um `data` do Prisma, inclusive `{ increment }`. */
const aplicar = (alvo: object, data: Dados) => {
  const campos = alvo as Dados;
  for (const [campo, valor] of Object.entries(data)) {
    campos[campo] =
      valor !== null && typeof valor === 'object' && 'increment' in valor
        ? (campos[campo] as number) + (valor as { increment: number }).increment
        : valor;
  }
};

describe('Recuperacao de senha (e2e) - RF03', () => {
  let app: INestApplication;
  let registros: Registro[];
  let usuario: { id: number; nome: string; email: string; senhaHash: string; versaoSessao: number };
  let enviarEmail: jest.Mock;

  // As tabelas ficam separadas do resto: e a elas que a transacao interativa
  // entrega o `tx`, e referenciar o objeto inteiro dentro dele seria circular.
  const tabelas = {
    usuario: {
      findUnique: jest.fn(({ where }: { where: { id?: number; email?: string } }) =>
        Promise.resolve(
          where.email === usuario.email || where.id === usuario.id ? { ...usuario } : null,
        ),
      ),
      update: jest.fn(({ data }: { data: Dados }) => {
        aplicar(usuario, data);
        return Promise.resolve({ ...usuario });
      }),
    },
    tokenRecuperacaoSenha: {
      create: jest.fn(({ data }: { data: Partial<Registro> }) => {
        const registro: Registro = {
          id: registros.length + 1,
          usuarioId: data.usuarioId!,
          codigoHash: data.codigoHash!,
          tentativas: 0,
          expiraEm: data.expiraEm!,
          verificadoEm: null,
          trocaHash: null,
          trocaExpiraEm: null,
          usadoEm: null,
          // Ordem estavel no `orderBy: criadoEm desc` mesmo no mesmo milissegundo.
          criadoEm: new Date(Date.now() + registros.length),
        };
        registros.push(registro);
        return Promise.resolve({ ...registro });
      }),
      findFirst: jest.fn(({ where }: { where: Dados }) => {
        const encontrado = registros
          .filter((registro) => atende(registro, where))
          .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())[0];
        return Promise.resolve(encontrado ? { ...encontrado } : null);
      }),
      findUnique: jest.fn(({ where }: { where: { trocaHash: string } }) => {
        const encontrado = registros.find((registro) => registro.trocaHash === where.trocaHash);
        return Promise.resolve(encontrado ? { ...encontrado } : null);
      }),
      updateMany: jest.fn(({ where, data }: { where: Dados; data: Dados }) => {
        const alvos = registros.filter((registro) => atende(registro, where));
        alvos.forEach((registro) => aplicar(registro, data));
        return Promise.resolve({ count: alvos.length });
      }),
    },
  };

  const prismaMock = {
    ...tabelas,
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    // Aceita as duas formas: lista de operacoes e transacao interativa.
    $transaction: jest.fn((operacoes: unknown) =>
      typeof operacoes === 'function'
        ? (operacoes as (tx: typeof tabelas) => Promise<unknown>)(tabelas)
        : Promise.all(operacoes as Promise<unknown>[]),
    ),
  };

  /**
   * Storage que sempre reporta a primeira batida, entao o ThrottlerGuard nunca
   * bloqueia. Substituimos o storage, e nao o guard: o guard entra pelo
   * APP_GUARD do AppModule, token que o overrideGuard nao alcanca.
   */
  const storageSemLimite = {
    increment: () =>
      Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
  };

  /** Sobe a aplicacao com Prisma e Mail mockados. */
  async function criarApp(configurar: (builder: TestingModuleBuilder) => TestingModuleBuilder) {
    const modulo = await configurar(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prismaMock)
        .overrideProvider(MailService)
        .useValue({ enviarEmail: (...args: unknown[]) => enviarEmail(...args) }),
    ).compile();

    const instancia = modulo.createNestApplication();
    instancia.setGlobalPrefix('api');
    instancia.useGlobalPipes(criarPipeValidacao());
    await instancia.init();
    return instancia;
  }

  /** Resolve com o corpo do proximo e-mail enviado pelo service. */
  function aguardarEnvio(): Promise<string> {
    return new Promise((resolve) =>
      enviarEmail.mockImplementationOnce((...args: unknown[]) => {
        resolve(args[2] as string);
        return Promise.resolve();
      }),
    );
  }

  /** Etapa 1 completa: dispara o pedido e devolve o codigo que foi por e-mail. */
  async function pedirCodigo(email = EMAIL): Promise<string> {
    const enviado = aguardarEnvio();

    await request(app.getHttpServer())
      .post('/api/auth/recuperar-senha')
      .send({ email })
      .expect(200);

    return (await enviado).match(/>(\d{6})</)![1];
  }

  beforeEach(() => {
    registros = [];
    usuario = {
      id: 1,
      nome: 'Ana',
      email: EMAIL,
      senhaHash: bcrypt.hashSync(SENHA_ANTIGA, 4),
      versaoSessao: 0,
    };
    enviarEmail = jest.fn().mockResolvedValue(undefined);
  });

  describe('fluxo das tres etapas', () => {
    beforeAll(async () => {
      enviarEmail = jest.fn().mockResolvedValue(undefined);
      // O rate limit tem teste proprio abaixo; aqui ele so atrapalharia.
      app = await criarApp((builder) =>
        builder.overrideProvider(ThrottlerStorage).useValue(storageSemLimite),
      );
    });

    afterAll(async () => {
      await app.close();
    });

    it('etapa 1 - responde 200 com mensagem generica e envia o codigo', async () => {
      const enviado = aguardarEnvio();

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/recuperar-senha')
        .send({ email: EMAIL })
        .expect(200);

      expect(resposta.body.mensagem).toContain('Se houver uma conta com este e-mail');
      expect(await enviado).toMatch(/>\d{6}</);
      expect(registros).toHaveLength(1);
    });

    it('etapa 1 - e-mail desconhecido recebe a mesma resposta, sem enviar nada', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/recuperar-senha')
        .send({ email: 'ninguem@example.com' })
        .expect(200);

      expect(resposta.body.mensagem).toContain('Se houver uma conta com este e-mail');
      expect(enviarEmail).not.toHaveBeenCalled();
      expect(registros).toHaveLength(0);
    });

    it('etapa 1 - rejeita e-mail fora do formato (400)', () =>
      request(app.getHttpServer())
        .post('/api/auth/recuperar-senha')
        .send({ email: 'nao-e-email' })
        .expect(400));

    it('etapa 2 - o codigo correto devolve o token de troca', async () => {
      const codigo = await pedirCodigo();

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      expect(typeof resposta.body.tokenTroca).toBe('string');
      expect(new Date(resposta.body.expiraEm as string).getTime()).toBeGreaterThan(Date.now());
    });

    it('etapa 2 - codigo errado responde 400 sem revelar o motivo', async () => {
      const codigo = await pedirCodigo();
      const errado = ((Number(codigo) + 1) % 1_000_000).toString().padStart(6, '0');

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo: errado })
        .expect(400);

      expect(resposta.body.message).toBe('Codigo invalido ou expirado');
    });

    it('etapa 2 - o codigo nao vale duas vezes', async () => {
      const codigo = await pedirCodigo();

      await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(400);
    });

    it('etapa 3 - troca a senha e encerra as sessoes abertas', async () => {
      const codigo = await pedirCodigo();
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/redefinir-senha')
        .send({
          tokenTroca: body.tokenTroca,
          novaSenha: SENHA_NOVA,
          confirmarNovaSenha: SENHA_NOVA,
        })
        .expect(200);

      expect(resposta.body.mensagem).toBe('Senha redefinida com sucesso');
      expect(bcrypt.compareSync(SENHA_NOVA, usuario.senhaHash)).toBe(true);
      // Revoga os JWTs emitidos antes da troca (mesmo mecanismo do logout).
      expect(usuario.versaoSessao).toBe(1);
    });

    it('etapa 3 - a senha nova funciona no login e a antiga nao', async () => {
      const codigo = await pedirCodigo();
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/redefinir-senha')
        .send({
          tokenTroca: body.tokenTroca,
          novaSenha: SENHA_NOVA,
          confirmarNovaSenha: SENHA_NOVA,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: EMAIL, senha: SENHA_NOVA })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: EMAIL, senha: SENHA_ANTIGA })
        .expect(401);
    });

    it('etapa 3 - confirmacao divergente responde 400', async () => {
      const codigo = await pedirCodigo();
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      const resposta = await request(app.getHttpServer())
        .post('/api/auth/redefinir-senha')
        .send({
          tokenTroca: body.tokenTroca,
          novaSenha: SENHA_NOVA,
          confirmarNovaSenha: 'outra-coisa-789',
        })
        .expect(400);

      expect(resposta.body.message).toBe('A confirmacao nao confere com a nova senha');
    });

    it('etapa 3 - token de troca inexistente responde 400', async () => {
      const resposta = await request(app.getHttpServer())
        .post('/api/auth/redefinir-senha')
        .send({
          tokenTroca: 'token-que-nunca-existiu',
          novaSenha: SENHA_NOVA,
          confirmarNovaSenha: SENHA_NOVA,
        })
        .expect(400);

      expect(resposta.body.message).toBe('Sessao de redefinicao invalida ou expirada');
    });

    it('etapa 3 - o mesmo token de troca nao serve duas vezes', async () => {
      const codigo = await pedirCodigo();
      const { body } = await request(app.getHttpServer())
        .post('/api/auth/verificar-codigo')
        .send({ email: EMAIL, codigo })
        .expect(200);

      const troca = {
        tokenTroca: body.tokenTroca,
        novaSenha: SENHA_NOVA,
        confirmarNovaSenha: SENHA_NOVA,
      };

      await request(app.getHttpServer()).post('/api/auth/redefinir-senha').send(troca).expect(200);
      await request(app.getHttpServer()).post('/api/auth/redefinir-senha').send(troca).expect(400);
    });
  });

  describe('rate limit do envio de codigo', () => {
    // App proprio: o ThrottlerGuard fica ativo e o contador comeca zerado.
    beforeAll(async () => {
      enviarEmail = jest.fn().mockResolvedValue(undefined);
      app = await criarApp((builder) => builder);
    });

    afterAll(async () => {
      await app.close();
    });

    it('permite 3 pedidos e responde 429 no quarto', async () => {
      const pedir = () =>
        request(app.getHttpServer()).post('/api/auth/recuperar-senha').send({ email: EMAIL });

      await pedir().expect(200);
      await pedir().expect(200);
      await pedir().expect(200);
      await pedir().expect(429);
    });
  });
});
