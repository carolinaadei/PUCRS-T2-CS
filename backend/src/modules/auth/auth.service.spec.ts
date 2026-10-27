import {
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';

// O modulo real, nao um namespace importado: e nele que o service le `compare`
// e `hash`, entao e nele que o spy precisa estar.
const bcryptjs = jest.requireActual<typeof import('bcryptjs')>('bcryptjs');

interface RegistroRecuperacao {
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

type Dados = Record<string, unknown>;

interface Operadores {
  lt?: number | Date;
  gt?: number | Date;
  gte?: number | Date;
}

const USUARIO = { id: 1, nome: 'Ana', email: 'ana@exemplo.com' };
const SENHA_ANTIGA_HASH = 'hash-da-senha-antiga';
const CODIGO_INVALIDO = 'Codigo invalido ou expirado';
const MAX_TENTATIVAS = 5;

const numero = (valor: unknown) => (valor instanceof Date ? valor.getTime() : (valor as number));

/**
 * Aplica um `where` do Prisma, inclusive `lt`, `gt` e `gte`. Os UPDATEs
 * condicionais do service dependem desses operadores para serem atomicos.
 */
const atende = (registro: RegistroRecuperacao, where: Dados) =>
  Object.entries(where).every(([campo, condicao]) => {
    const valor = registro[campo as keyof RegistroRecuperacao];

    if (condicao === null || typeof condicao !== 'object' || condicao instanceof Date) {
      return valor === condicao;
    }

    const { lt, gt, gte } = condicao as Operadores;
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

/**
 * RF02 e RF03. As tabelas sao simuladas em memoria e aplicam o `where` de
 * verdade, para que o teste cubra o comportamento das queries e nao apenas o
 * formato delas. Cada chamada ao mock grava de forma sincrona, como uma linha
 * travada no banco: e isso que permite testar requisicoes simultaneas.
 */
describe('AuthService - login e recuperacao de senha (RF02/RF03)', () => {
  let service: AuthService;
  let registros: RegistroRecuperacao[];
  let usuario: typeof USUARIO & { senhaHash: string; versaoSessao: number };
  let enviarEmail: jest.Mock;
  let prisma: ReturnType<typeof criarPrisma>;

  function criarPrisma() {
    let proximoId = 1;

    const tabelas = {
      usuario: {
        findUnique: jest.fn(({ where }: { where: { email: string } }) =>
          Promise.resolve(where.email === usuario.email ? { ...usuario } : null),
        ),
        update: jest.fn(({ data }: { data: Dados }) => {
          aplicar(usuario, data);
          return Promise.resolve({ ...usuario });
        }),
      },
      tokenRecuperacaoSenha: {
        create: jest.fn(({ data }: { data: Partial<RegistroRecuperacao> }) => {
          const registro: RegistroRecuperacao = {
            id: proximoId,
            usuarioId: data.usuarioId!,
            codigoHash: data.codigoHash!,
            tentativas: 0,
            expiraEm: data.expiraEm!,
            verificadoEm: null,
            trocaHash: null,
            trocaExpiraEm: null,
            usadoEm: null,
            // Garante ordem estavel no `orderBy: criadoEm desc` mesmo no mesmo milissegundo.
            criadoEm: new Date(Date.now() + proximoId),
          };
          proximoId++;
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

    return {
      ...tabelas,
      // Aceita as duas formas: lista de operacoes e transacao interativa.
      $transaction: jest.fn((operacoes: unknown) =>
        typeof operacoes === 'function'
          ? (operacoes as (tx: typeof tabelas) => Promise<unknown>)(tabelas)
          : Promise.all(operacoes as Promise<unknown>[]),
      ),
    };
  }

  beforeEach(async () => {
    registros = [];
    usuario = { ...USUARIO, senhaHash: SENHA_ANTIGA_HASH, versaoSessao: 0 };
    prisma = criarPrisma();
    enviarEmail = jest.fn().mockResolvedValue(undefined);

    const configuracao: Record<string, unknown> = {
      'seguranca.segredoRecuperacao': 'segredo-de-teste-com-mais-de-32-caracteres',
      'seguranca.saltRounds': 4,
    };

    const modulo = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: (chave: string) => configuracao[chave] } },
        { provide: MailService, useValue: { enviarEmail } },
      ],
    }).compile();

    service = modulo.get(AuthService);

    // O service loga o codigo em debug; silencia para nao poluir a saida dos testes.
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Resolve com o corpo do proximo e-mail que o service enviar. */
  function aguardarEnvio(): Promise<string> {
    return new Promise((resolve) =>
      enviarEmail.mockImplementationOnce((...args: unknown[]) => {
        resolve(args[2] as string);
        return Promise.resolve();
      }),
    );
  }

  /**
   * Executa a etapa 1 real e devolve o codigo que foi enviado por e-mail. Como
   * a etapa 1 nao espera o envio, o teste aguarda o proprio e-mail.
   */
  async function solicitarCodigo(): Promise<string> {
    const enviado = aguardarEnvio();
    service.solicitarRecuperacaoSenha(USUARIO.email);
    return (await enviado).match(/>(\d{6})</)![1];
  }

  /** Percorre as etapas 1 e 2 e devolve o token que autoriza a troca. */
  async function obterTokenTroca(): Promise<string> {
    const { tokenTroca } = await service.verificarCodigo(USUARIO.email, await solicitarCodigo());
    return tokenTroca;
  }

  /** Um codigo de 6 digitos garantidamente diferente do correto. */
  const codigoErrado = (correto: string) =>
    ((Number(correto) + 1) % 1_000_000).toString().padStart(6, '0');

  it('login - e-mail desconhecido tambem paga o custo do bcrypt', async () => {
    const compare = jest.spyOn(bcryptjs, 'compare');
    const hash = jest.spyOn(bcryptjs, 'hash');
    const tentativa = { email: 'ninguem@exemplo.com', senha: 'qualquer-senha' };

    await expect(service.login(tentativa)).rejects.toThrow(UnauthorizedException);
    await expect(service.login(tentativa)).rejects.toThrow(UnauthorizedException);

    expect(compare).toHaveBeenCalledTimes(2);
    // O hash descartavel e gerado uma vez so e reaproveitado.
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('etapa 1 - retorna antes de gravar o codigo e de enviar o e-mail', async () => {
    const enviado = aguardarEnvio();

    expect(service.solicitarRecuperacaoSenha(USUARIO.email)).toBeUndefined();
    expect(registros).toHaveLength(0);
    expect(enviarEmail).not.toHaveBeenCalled();

    // O trabalho segue em segundo plano e termina sem ninguem esperar por ele.
    await enviado;
    expect(registros).toHaveLength(1);
  });

  it('etapa 1 - falha em segundo plano vai para o log, sem rejeicao solta', async () => {
    const logado = new Promise<string>((resolve) =>
      jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation((mensagem: unknown) => resolve(String(mensagem))),
    );
    prisma.usuario.findUnique.mockRejectedValueOnce(new Error('banco fora do ar'));

    service.solicitarRecuperacaoSenha(USUARIO.email);

    await expect(logado).resolves.toContain('banco fora do ar');
  });

  it('emite o token de troca quando o codigo confere', async () => {
    const codigo = await solicitarCodigo();

    const resposta = await service.verificarCodigo(USUARIO.email, codigo);

    expect(resposta.tokenTroca).toEqual(expect.any(String));
    expect(new Date(resposta.expiraEm).getTime()).toBeGreaterThan(Date.now());
    expect(registros[0].verificadoEm).toBeInstanceOf(Date);
    expect(registros[0].trocaHash).not.toBeNull();
  });

  it('aceita e-mail com maiusculas e espacos', async () => {
    const codigo = await solicitarCodigo();

    await expect(service.verificarCodigo('  ANA@Exemplo.com ', codigo)).resolves.toBeDefined();
  });

  it('nao aceita o mesmo codigo uma segunda vez (uso unico)', async () => {
    const codigo = await solicitarCodigo();
    await service.verificarCodigo(USUARIO.email, codigo);
    const trocaHashOriginal = registros[0].trocaHash;

    await expect(service.verificarCodigo(USUARIO.email, codigo)).rejects.toThrow(CODIGO_INVALIDO);

    // A reverificacao nao pode gerar outro token e invalidar o que o usuario ja recebeu.
    expect(registros[0].trocaHash).toBe(trocaHashOriginal);
  });

  it('codigos errados depois da verificacao nao queimam a troca em andamento', async () => {
    const codigo = await solicitarCodigo();
    await service.verificarCodigo(USUARIO.email, codigo);
    const tentativasAposVerificar = registros[0].tentativas;

    for (let i = 0; i < 10; i++) {
      await expect(service.verificarCodigo(USUARIO.email, codigoErrado(codigo))).rejects.toThrow(
        CODIGO_INVALIDO,
      );
    }

    expect(registros[0].usadoEm).toBeNull();
    expect(registros[0].tentativas).toBe(tentativasAposVerificar);
  });

  it('rejeita codigo errado e conta a tentativa', async () => {
    const codigo = await solicitarCodigo();

    await expect(service.verificarCodigo(USUARIO.email, codigoErrado(codigo))).rejects.toThrow(
      BadRequestException,
    );

    expect(registros[0].tentativas).toBe(1);
    expect(registros[0].usadoEm).toBeNull();
  });

  it('queima o codigo ao atingir o teto de tentativas, mesmo que depois venha o certo', async () => {
    const codigo = await solicitarCodigo();

    for (let i = 0; i < MAX_TENTATIVAS; i++) {
      await expect(service.verificarCodigo(USUARIO.email, codigoErrado(codigo))).rejects.toThrow(
        CODIGO_INVALIDO,
      );
    }

    expect(registros[0].usadoEm).toBeInstanceOf(Date);
    await expect(service.verificarCodigo(USUARIO.email, codigo)).rejects.toThrow(CODIGO_INVALIDO);
  });

  it('palpites simultaneos nao furam o teto de tentativas', async () => {
    const codigo = await solicitarCodigo();
    // Rajada maior que o teto, com o codigo certo por ultimo: todas leem o
    // registro antes de qualquer uma gravar, como num ataque em paralelo.
    const palpites = [...Array<string>(9).fill(codigoErrado(codigo)), codigo];

    const resultados = await Promise.allSettled(
      palpites.map((palpite) => service.verificarCodigo(USUARIO.email, palpite)),
    );

    expect(resultados.every((resultado) => resultado.status === 'rejected')).toBe(true);
    expect(registros[0].tentativas).toBe(MAX_TENTATIVAS);
    expect(registros[0].usadoEm).toBeInstanceOf(Date);
  });

  it('duas verificacoes simultaneas do codigo certo emitem um token so', async () => {
    const codigo = await solicitarCodigo();

    const resultados = await Promise.allSettled([
      service.verificarCodigo(USUARIO.email, codigo),
      service.verificarCodigo(USUARIO.email, codigo),
    ]);

    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejeita codigo expirado', async () => {
    const codigo = await solicitarCodigo();
    registros[0].expiraEm = new Date(Date.now() - 1000);

    await expect(service.verificarCodigo(USUARIO.email, codigo)).rejects.toThrow(CODIGO_INVALIDO);
  });

  it('um novo pedido invalida o codigo anterior', async () => {
    const primeiro = await solicitarCodigo();
    const segundo = await solicitarCodigo();

    if (primeiro !== segundo) {
      await expect(service.verificarCodigo(USUARIO.email, primeiro)).rejects.toThrow(
        CODIGO_INVALIDO,
      );
    }
    await expect(service.verificarCodigo(USUARIO.email, segundo)).resolves.toBeDefined();
    expect(registros[0].usadoEm).toBeInstanceOf(Date);
  });

  it('responde com a mesma mensagem para e-mail desconhecido', async () => {
    await expect(service.verificarCodigo('ninguem@exemplo.com', '123456')).rejects.toThrow(
      CODIGO_INVALIDO,
    );
  });

  it('etapa 3 - troca a senha e revoga os JWTs emitidos antes', async () => {
    const tokenTroca = await obterTokenTroca();

    await service.redefinirSenha(tokenTroca, 'nova-senha-123', 'nova-senha-123');

    expect(await bcryptjs.compare('nova-senha-123', usuario.senhaHash)).toBe(true);
    expect(usuario.versaoSessao).toBe(1);
    expect(registros[0].usadoEm).toBeInstanceOf(Date);
  });

  it('etapa 3 - o mesmo token nao troca a senha duas vezes, nem em paralelo', async () => {
    const tokenTroca = await obterTokenTroca();

    const resultados = await Promise.allSettled([
      service.redefinirSenha(tokenTroca, 'nova-senha-123', 'nova-senha-123'),
      service.redefinirSenha(tokenTroca, 'outra-senha-456', 'outra-senha-456'),
    ]);

    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
    expect(usuario.versaoSessao).toBe(1);
  });

  it('logout - incrementa a versao de sessao e derruba os tokens ja emitidos', async () => {
    expect(usuario.versaoSessao).toBe(0);

    await expect(service.logout(USUARIO.id)).resolves.toEqual({
      mensagem: 'Logout realizado com sucesso',
    });

    // A JwtStrategy compara `payload.ver` com este campo: qualquer token
    // assinado antes daqui deixa de valer.
    expect(usuario.versaoSessao).toBe(1);
  });
});

/**
 * Testes unitarios do AuthService (RF01 e RF02).
 * Valida os fluxos de login, logout e registro com dependencias mockadas.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    usuario: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let jwtService: {
    sign: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const usuarioMock = {
    id: 1,
    nome: 'Teste Silva',
    email: 'teste@example.com',
    senhaHash: '',
    versaoSessao: 0,
  };

  beforeAll(async () => {
    usuarioMock.senhaHash = await bcrypt.hash('senhaCorreta123', 10);
  });

  beforeEach(async () => {
    prisma = {
      usuario: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mocked.jwt.token'),
    };

    configService = {
      get: jest.fn((chave: string) => {
        if (chave === 'seguranca.saltRounds') return 10;
        if (chave === 'jwt.segredo') return 'test-secret';
        if (chave === 'jwt.expiraEm') return '7d';
        return null;
      }),
    };

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: MailService, useValue: { enviarEmail: jest.fn() } },
      ],
    }).compile();

    service = modulo.get<AuthService>(AuthService);
  });

  describe('RF02 - login', () => {
    it('deve autenticar o usuario com credenciais validas e retornar token JWT e dados do usuario', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioMock);

      const resultado = await service.login({
        email: '  TESTE@example.com  ',
        senha: 'senhaCorreta123',
      });

      expect(prisma.usuario.findUnique).toHaveBeenCalledWith({
        where: { email: 'teste@example.com' },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        email: 'teste@example.com',
        ver: 0,
      });
      expect(resultado).toEqual({
        accessToken: 'mocked.jwt.token',
        usuario: {
          id: 1,
          nome: 'Teste Silva',
          email: 'teste@example.com',
        },
      });
    });

    it('deve lancar UnauthorizedException quando o usuario nao for encontrado', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'inexistente@example.com',
          senha: 'senhaQualquer',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('deve lancar UnauthorizedException quando a senha estiver incorreta', async () => {
      prisma.usuario.findUnique.mockResolvedValue(usuarioMock);

      await expect(
        service.login({
          email: 'teste@example.com',
          senha: 'senhaErrada',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('RF02 - logout', () => {
    it('deve incrementar a versao de sessao para invalidar os tokens ja emitidos', async () => {
      prisma.usuario.update.mockResolvedValue({ ...usuarioMock, versaoSessao: 1 });

      const resultado = await service.logout(1);

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { versaoSessao: { increment: 1 } },
      });
      expect(resultado).toEqual({
        mensagem: 'Logout realizado com sucesso',
      });
    });
  });

  describe('RF01 - registrar', () => {
    it('deve registrar um novo usuario com sucesso', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue({
        id: 2,
        nome: 'Novo Usuario',
        email: 'novo@example.com',
        versaoSessao: 0,
      });

      const resultado = await service.registrar({
        nome: 'Novo Usuario',
        email: 'novo@example.com',
        senha: 'senhaSegura123',
      });

      expect(resultado).toEqual({
        accessToken: 'mocked.jwt.token',
        usuario: {
          id: 2,
          nome: 'Novo Usuario',
          email: 'novo@example.com',
        },
      });
    });

    it('deve lancar ConflictException se o email ja estiver cadastrado', async () => {
      prisma.usuario.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.registrar({
          nome: 'Outro Nome',
          email: 'teste@example.com',
          senha: 'senhaSegura123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
