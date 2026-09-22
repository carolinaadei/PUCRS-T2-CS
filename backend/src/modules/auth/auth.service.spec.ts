import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';

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

type Filtro = Partial<RegistroRecuperacao>;

const USUARIO = { id: 1, nome: 'Ana', email: 'ana@exemplo.com' };
const CODIGO_INVALIDO = 'Codigo invalido ou expirado';

/**
 * RF03 - etapa 2 (verificarCodigo). A tabela de recuperacao e simulada em
 * memoria e aplica o `where` de verdade, para que o teste cubra o comportamento
 * da busca e nao apenas o formato da query.
 */
describe('AuthService - verificarCodigo (RF03)', () => {
  let service: AuthService;
  let registros: RegistroRecuperacao[];
  let enviarEmail: jest.Mock;

  const atende = (registro: RegistroRecuperacao, where: Filtro) =>
    Object.entries(where).every(
      ([campo, valor]) => registro[campo as keyof RegistroRecuperacao] === valor,
    );

  beforeEach(async () => {
    registros = [];
    let proximoId = 1;

    const prisma = {
      usuario: {
        findUnique: jest.fn(({ where }: { where: { email: string } }) =>
          Promise.resolve(where.email === USUARIO.email ? USUARIO : null),
        ),
      },
      tokenRecuperacaoSenha: {
        create: jest.fn(({ data }: { data: Filtro }) => {
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
        findFirst: jest.fn(({ where }: { where: Filtro }) => {
          const encontrado = registros
            .filter((registro) => atende(registro, where))
            .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())[0];
          return Promise.resolve(encontrado ? { ...encontrado } : null);
        }),
        update: jest.fn(({ where, data }: { where: { id: number }; data: Filtro }) => {
          const registro = registros.find((r) => r.id === where.id)!;
          Object.assign(registro, data);
          return Promise.resolve({ ...registro });
        }),
        updateMany: jest.fn(({ where, data }: { where: Filtro; data: Filtro }) => {
          const alvos = registros.filter((registro) => atende(registro, where));
          alvos.forEach((registro) => Object.assign(registro, data));
          return Promise.resolve({ count: alvos.length });
        }),
      },
      $transaction: jest.fn((operacoes: Promise<unknown>[]) => Promise.all(operacoes)),
    };

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

  /** Executa a etapa 1 real e devolve o codigo que foi enviado por e-mail. */
  async function solicitarCodigo(): Promise<string> {
    await service.solicitarRecuperacaoSenha(USUARIO.email);
    const html = enviarEmail.mock.calls.at(-1)![2] as string;
    return html.match(/>(\d{6})</)![1];
  }

  /** Um codigo de 6 digitos garantidamente diferente do correto. */
  const codigoErrado = (correto: string) =>
    ((Number(correto) + 1) % 1_000_000).toString().padStart(6, '0');

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

    for (let i = 0; i < 10; i++) {
      await expect(service.verificarCodigo(USUARIO.email, codigoErrado(codigo))).rejects.toThrow(
        CODIGO_INVALIDO,
      );
    }

    expect(registros[0].usadoEm).toBeNull();
    expect(registros[0].tentativas).toBe(0);
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

    for (let i = 0; i < 5; i++) {
      await expect(service.verificarCodigo(USUARIO.email, codigoErrado(codigo))).rejects.toThrow(
        CODIGO_INVALIDO,
      );
    }

    expect(registros[0].usadoEm).toBeInstanceOf(Date);
    await expect(service.verificarCodigo(USUARIO.email, codigo)).rejects.toThrow(CODIGO_INVALIDO);
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
});
