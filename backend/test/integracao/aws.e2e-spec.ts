import { ConfigService } from '@nestjs/config';
import { FilaEmailsService } from '../../src/aws/fila-emails.service';
import { carregarConfiguracaoDaAws } from '../../src/config/configuracao-aws';
import { Configuracao } from '../../src/config/configuracao';
import { ProvedorEmailSes } from '../../src/modules/mail/provedores';
import { ConsumidorEmails } from '../../src/worker/consumidor-emails';
import {
  AppDeTeste,
  bearer,
  comBanco,
  Conta,
  criarApp,
  limparBanco,
  registrar,
} from '../apoio/app';

/**
 * Integracao com os servicos da AWS emulados pelo MiniStack, com a pilha
 * infra/cloudformation/viajajunto.yaml ja aplicada (npm run infra:up, ou o passo
 * do CI). Sem MINISTACK_TESTE (ex.: http://localhost:4566) a suite e pulada.
 */
const MINISTACK = process.env.MINISTACK_TESTE;
const comMiniStack: jest.Describe = MINISTACK ? comBanco : describe.skip;

const AMBIENTE_AWS = {
  AWS_REGION: 'us-east-1',
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_ENDPOINT_URL: MINISTACK,
  S3_BUCKET_MIDIA: 'viajajunto-local-midia',
  S3_ENDPOINT_PUBLICO: MINISTACK,
  // URL da fila no MiniStack (conta padrao 000000000000), como a pilha grava no SSM.
  SQS_FILA_EMAILS: `${MINISTACK}/000000000000/viajajunto-local-emails`,
  UPLOAD_TAMANHO_MAXIMO_MB: '1',
};

comMiniStack('Servicos AWS no MiniStack (integracao)', () => {
  const ambienteOriginal = { ...process.env };
  let t: AppDeTeste;
  let ana: Conta;

  beforeAll(async () => {
    Object.assign(process.env, AMBIENTE_AWS);
    t = await criarApp();
    await limparBanco(t.app);
    ana = await registrar(t.http, 'Ana', 'ana@teste.com');
  });

  afterAll(async () => {
    await limparBanco(t.app);
    await t.app.close();
    // As suites rodam no mesmo processo: nao deixa o ambiente AWS vazar para as outras.
    for (const chave of Object.keys(AMBIENTE_AWS)) {
      if (ambienteOriginal[chave] === undefined) delete process.env[chave];
      else process.env[chave] = ambienteOriginal[chave];
    }
  });

  /** Faz o papel do navegador: POST multipart direto no S3 com o formulario assinado. */
  async function enviarAoS3(
    autorizacao: { url: string; campos: Record<string, string> },
    arquivo: Blob,
  ) {
    const formulario = new FormData();
    for (const [campo, valor] of Object.entries(autorizacao.campos)) {
      formulario.append(campo, valor);
    }
    formulario.append('file', arquivo);
    return fetch(autorizacao.url, { method: 'POST', body: formulario });
  }

  describe('upload de fotos (S3)', () => {
    it('autoriza, o navegador envia direto e a foto fica publica', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/uploads')
        .set(bearer(ana.token))
        .send({ finalidade: 'ATIVIDADE', tipoConteudo: 'image/webp' })
        .expect(201);

      expect(body).toMatchObject({
        url: `${MINISTACK}/viajajunto-local-midia`,
        chave: expect.stringMatching(/^publico\/atividades\/[\w-]+\.webp$/),
        tamanhoMaximoBytes: 1024 * 1024,
      });

      const envio = await enviarAoS3(body, new Blob(['RIFF-webp'], { type: 'image/webp' }));
      expect(envio.status).toBe(204);

      const foto = await fetch(body.urlPublica);
      expect(await foto.text()).toBe('RIFF-webp');
    });

    it('o proprio S3 recusa arquivo acima do limite e tipo diferente do assinado', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/uploads')
        .set(bearer(ana.token))
        .send({ finalidade: 'DESTINO', tipoConteudo: 'image/jpeg' })
        .expect(201);

      const grande = await enviarAoS3(body, new Blob([new Uint8Array(1024 * 1024 + 1)]));
      expect(grande.status).toBe(400);
      expect(await grande.text()).toContain('EntityTooLarge');

      const outroTipo = await enviarAoS3(
        { ...body, campos: { ...body.campos, 'Content-Type': 'text/html' } },
        new Blob(['<script>'], { type: 'text/html' }),
      );
      expect(outroTipo.status).toBe(403);
    });

    it('recusa tipo de arquivo que nao e imagem antes de assinar', async () => {
      const { body } = await t
        .http()
        .post('/api/v1/uploads')
        .set(bearer(ana.token))
        .send({ finalidade: 'DESTINO', tipoConteudo: 'application/pdf' })
        .expect(400);
      expect(body.codigo).toBe('VALIDACAO');
    });
  });

  describe('e-mails pela fila (SQS) e pelo SES', () => {
    it('a API enfileira e o worker entrega', async () => {
      await t
        .http()
        .post('/api/v1/auth/recuperar-senha')
        .send({ email: 'ana@teste.com' })
        .expect(202);

      // A API so publicou na fila: nada chegou ao provedor ainda.
      await new Promise((resolver) => setTimeout(resolver, 300));
      expect(t.emails.ultimaPara('ana@teste.com')).toBeUndefined();

      const worker = new ConsumidorEmails(t.app.get(FilaEmailsService), t.emails);
      let entregues = 0;
      for (let ciclo = 0; ciclo < 5 && entregues === 0; ciclo++) {
        entregues = await worker.processarLote(1);
      }

      expect(entregues).toBe(1);
      expect(t.emails.ultimaPara('ana@teste.com')!.texto).toMatch(/\b\d{6}\b/);
    });

    it('o provedor SES entrega, e o MiniStack guarda o e-mail para inspecao', async () => {
      const config = t.app.get(ConfigService);
      const provedor = new ProvedorEmailSes({
        mail: config.get<Configuracao['mail']>('mail')!,
        aws: config.get<Configuracao['aws']>('aws')!,
      } as Configuracao);
      const assunto = `Teste ${Date.now()}`;

      await provedor.enviar({
        para: { email: 'ana@teste.com' },
        assunto,
        html: '<p>ola</p>',
        texto: 'ola',
      });

      const caixa = (await (await fetch(`${MINISTACK}/_ministack/ses/messages`)).json()) as {
        messages: Record<string, { Subject: string; To: string[] }[]>;
      };
      const enviados = Object.values(caixa.messages).flat();
      expect(enviados.find((mensagem) => mensagem.Subject === assunto)?.To).toEqual([
        'ana@teste.com',
      ]);
    });
  });

  describe('configuracao vinda da pilha (Secrets Manager e SSM)', () => {
    it('le os segredos gerados e os parametros, sem sobrescrever o que ja veio do ambiente', async () => {
      const ambiente: Record<string, string | undefined> = {
        AWS_REGION: 'us-east-1',
        CONFIG_AWS_SEGREDOS: 'viajajunto/local/jwt, viajajunto/local/recuperacao',
        CONFIG_AWS_PARAMETROS: '/viajajunto/local/',
        PUBLIC_URL: 'http://definido-no-ambiente',
      };

      await carregarConfiguracaoDaAws(ambiente, { log: jest.fn() } as never);

      expect(ambiente.JWT_SECRET?.length).toBeGreaterThanOrEqual(32);
      expect(ambiente.RECUPERACAO_CODIGO_SECRET?.length).toBeGreaterThanOrEqual(32);
      expect(ambiente).toMatchObject({
        S3_BUCKET_MIDIA: 'viajajunto-local-midia',
        SQS_FILA_EMAILS: expect.stringMatching(/\/000000000000\/viajajunto-local-emails$/),
        MAIL_PROVEDOR: 'ses',
        PUBLIC_URL: 'http://definido-no-ambiente',
      });
    });
  });
});
