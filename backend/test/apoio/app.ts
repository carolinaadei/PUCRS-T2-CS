import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configurarAplicacao } from '../../src/config/aplicacao';
import {
  MensagemEmail,
  PROVEDOR_EMAIL,
  ProvedorEmail,
} from '../../src/modules/mail/mensagem-email';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Provedor de e-mail que so guarda o que receberia: os testes leem o codigo daqui. */
export class CaixaDeEmails implements ProvedorEmail {
  readonly nome = 'teste';
  readonly mensagens: MensagemEmail[] = [];

  enviar(mensagem: MensagemEmail): Promise<void> {
    this.mensagens.push(mensagem);
    return Promise.resolve();
  }

  ultimaPara(email: string): MensagemEmail | undefined {
    return [...this.mensagens].reverse().find((mensagem) => mensagem.para.email === email);
  }

  /**
   * O e-mail de recuperacao e enviado depois da resposta HTTP (para o tempo nao
   * revelar se a conta existe): espera ele chegar e devolve o codigo de 6 digitos.
   */
  async esperarCodigo(email: string, jaRecebidos = 0): Promise<string> {
    for (let tentativa = 0; tentativa < 100; tentativa++) {
      const doDestinatario = this.mensagens.filter((mensagem) => mensagem.para.email === email);
      if (doDestinatario.length > jaRecebidos) {
        return /\b(\d{6})\b/.exec(doDestinatario[doDestinatario.length - 1].texto)![1];
      }
      await new Promise((resolver) => setTimeout(resolver, 20));
    }

    throw new Error(`Nenhum e-mail chegou para ${email}`);
  }
}

/** Storage que sempre reporta a primeira batida: o ThrottlerGuard nunca bloqueia. */
export const storageSemLimite = {
  increment: () =>
    Promise.resolve({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }),
};

export interface OpcoesApp {
  /** Ajustes no modulo antes de compilar (overrideProvider etc.). */
  ajustar?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  /** Mantem o rate limit de verdade (padrao: desligado). */
  comLimite?: boolean;
}

export interface AppDeTeste {
  app: INestApplication;
  emails: CaixaDeEmails;
  http: () => ReturnType<typeof request>;
}

/**
 * Sobe a aplicacao inteira com a MESMA configuracao HTTP de producao
 * (configurarAplicacao): prefixo, versao, filtro de erros, pipe, CORS, request id.
 */
export async function criarApp(opcoes: OpcoesApp = {}): Promise<AppDeTeste> {
  const emails = new CaixaDeEmails();

  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PROVEDOR_EMAIL)
    .useValue(emails);

  if (!opcoes.comLimite) {
    builder = builder.overrideProvider(ThrottlerStorage).useValue(storageSemLimite);
  }

  if (opcoes.ajustar) {
    builder = opcoes.ajustar(builder);
  }

  const modulo = await builder.compile();
  // forceCloseConnections: uma requisicao recusada pelo tamanho (413) deixa o
  // corpo sem ler e a conexao aberta; sem isto o app.close() do teste trava.
  const app = modulo.createNestApplication<NestExpressApplication>({
    logger: ['fatal'],
    forceCloseConnections: true,
  });
  configurarAplicacao(app);
  await app.init();

  return { app, emails, http: () => request(app.getHttpServer()) };
}

const TABELAS = [
  'notificacao',
  'sessao_refresh',
  'avaliacao',
  'atividade_viagem',
  'orcamento',
  'destino_viagem',
  'membro_viagem',
  'token_recuperacao_senha',
  'viagem',
  'catalogo_atividade',
  'destino_catalogo',
  'usuario',
];

export const limparBanco = (app: INestApplication) =>
  app
    .get(PrismaService)
    .$executeRawUnsafe(`TRUNCATE TABLE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);

/**
 * Declara uma suite que precisa de servicos de verdade. Sem as variaveis ela e
 * pulada com um aviso, para `npm run test:e2e` seguir rodando numa maquina sem
 * nada, sem esconder que a regra de negocio ficou sem teste.
 */
export const suiteQueExige =
  (...variaveis: string[]) =>
  (nome: string, corpo: () => void): void => {
    const faltando = variaveis.filter((variavel) => !process.env[variavel]);
    if (faltando.length > 0) {
      // Direto no stderr: o Jest descarta o console.* de arquivos sem teste executado.
      process.stderr.write(`Suite pulada (defina ${faltando.join(' e ')}): ${nome}\n`);
      describe.skip(nome, corpo);
    } else {
      describe(nome, corpo);
    }
  };

/**
 * Suites que precisam de um PostgreSQL de verdade. O banco precisa ser dedicado:
 * as tabelas sao truncadas entre as suites.
 */
export const comBanco = suiteQueExige('DATABASE_URL_TESTE');

if (process.env.DATABASE_URL_TESTE) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TESTE;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Conta {
  id: number;
  nome: string;
  email: string;
  token: string;
  refreshToken: string;
}

/** Cadastra uma conta pela API e devolve os tokens. */
export async function registrar(
  http: AppDeTeste['http'],
  nome: string,
  email: string,
  senha = 'senhaSegura123',
): Promise<Conta> {
  const { body } = await http()
    .post('/api/v1/auth/registrar')
    .send({ nome, email, senha })
    .expect(201);

  return {
    id: body.usuario.id,
    nome,
    email,
    token: body.accessToken,
    refreshToken: body.refreshToken,
  };
}
