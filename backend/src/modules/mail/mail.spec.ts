import { SESv2Client } from '@aws-sdk/client-sesv2';
import { ConfigService } from '@nestjs/config';
import { FilaEmailsService } from '../../aws/fila-emails.service';
import { Configuracao } from '../../config/configuracao';
import { MailService } from './mail.service';
import { lerMensagemEmail, MensagemEmail, ProvedorEmail } from './mensagem-email';
import {
  ProvedorEmailBrevo,
  ProvedorEmailLog,
  ProvedorEmailSes,
  criarProvedorEmail,
} from './provedores';

const mensagem: MensagemEmail = {
  para: { email: 'ana@teste.com', nome: 'Ana' },
  assunto: 'Seu codigo',
  html: '<p>123456</p>',
  texto: '123456',
};

const configuracao = (mail: Partial<Configuracao['mail']> = {}) =>
  ({
    mail: {
      provedor: 'log',
      remetenteEmail: 'nao-responda@viajajunto.com',
      remetenteNome: 'ViajaJunto',
      brevoApiKey: 'chave-brevo',
      ...mail,
    },
    aws: { regiao: 'us-east-1', endpoint: 'http://ministack:4566' },
  }) as Configuracao;

describe('MailService', () => {
  const provedor: ProvedorEmail = { nome: 'falso', enviar: jest.fn().mockResolvedValue(undefined) };

  it('com fila ativa so enfileira; quem entrega e o worker', async () => {
    const fila = { ativa: true, publicar: jest.fn().mockResolvedValue(undefined) };

    await new MailService(fila as unknown as FilaEmailsService, provedor).enviar(mensagem);

    expect(fila.publicar).toHaveBeenCalledWith(mensagem);
    expect(provedor.enviar).not.toHaveBeenCalled();
  });

  it('sem fila entrega na hora pelo provedor', async () => {
    const fila = { ativa: false, publicar: jest.fn() };

    await new MailService(fila as unknown as FilaEmailsService, provedor).enviar(mensagem);

    expect(provedor.enviar).toHaveBeenCalledWith(mensagem);
    expect(fila.publicar).not.toHaveBeenCalled();
  });
});

describe('provedores de e-mail', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['log', ProvedorEmailLog],
    ['ses', ProvedorEmailSes],
    ['brevo', ProvedorEmailBrevo],
  ] as const)('MAIL_PROVEDOR=%s escolhe o provedor certo', (nome, classe) => {
    const config = configuracao({ provedor: nome });
    const configService = {
      get: (chave: 'mail' | 'aws') => config[chave],
    } as unknown as ConfigService;

    expect(criarProvedorEmail(configService)).toBeInstanceOf(classe);
  });

  it('log nao falha e nao chama ninguem', async () => {
    await expect(new ProvedorEmailLog().enviar(mensagem)).resolves.toBeUndefined();
  });

  it('SES envia texto e HTML com o remetente configurado', async () => {
    const enviar = jest.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({} as never);

    await new ProvedorEmailSes(configuracao()).enviar(mensagem);

    expect(enviar.mock.calls[0][0].input).toMatchObject({
      FromEmailAddress: 'ViajaJunto <nao-responda@viajajunto.com>',
      Destination: { ToAddresses: ['ana@teste.com'] },
      Content: { Simple: { Subject: { Data: 'Seu codigo' }, Body: { Text: { Data: '123456' } } } },
    });
  });

  it('Brevo chama a API transacional e falha com o corpo do erro', async () => {
    const fetchFalso = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 201 }))
      .mockResolvedValueOnce(new Response('{"code":"unauthorized"}', { status: 401 }));
    const brevo = new ProvedorEmailBrevo(configuracao());

    await brevo.enviar(mensagem);
    const [url, opcoes] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(opcoes.headers).toMatchObject({ 'api-key': 'chave-brevo' });
    expect(JSON.parse(opcoes.body as string)).toMatchObject({
      sender: { email: 'nao-responda@viajajunto.com', name: 'ViajaJunto' },
      to: [{ email: 'ana@teste.com', name: 'Ana' }],
      textContent: '123456',
    });

    await expect(brevo.enviar(mensagem)).rejects.toThrow(
      'Brevo respondeu 401: {"code":"unauthorized"}',
    );
  });
});

describe('lerMensagemEmail', () => {
  it('le um e-mail completo', () => {
    expect(lerMensagemEmail(JSON.stringify(mensagem))).toEqual(mensagem);
  });

  it.each([undefined, '', 'nao-e-json', 'null', '{}', '[]', '{"para":{"email":1}}'])(
    'devolve null para o que nao e e-mail: %p',
    (corpo) => {
      expect(lerMensagemEmail(corpo)).toBeNull();
    },
  );

  it('exige assunto, html e texto alem do destinatario', () => {
    // JSON.stringify omite o campo undefined: o corpo chega sem `texto`.
    expect(lerMensagemEmail(JSON.stringify({ ...mensagem, texto: undefined }))).toBeNull();
  });
});
