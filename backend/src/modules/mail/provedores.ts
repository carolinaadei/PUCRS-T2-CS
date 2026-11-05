import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuracao } from '../../config/configuracao';
import { MensagemEmail, ProvedorEmail } from './mensagem-email';

const URL_API_BREVO = 'https://api.brevo.com/v3/smtp/email';

/** Sem uma resposta em 10 s o envio e dado como falho e volta para a fila. */
const TEMPO_LIMITE_MS = 10_000;

/**
 * Desenvolvimento sem provedor: o e-mail vai para o log. E o padrao quando
 * MAIL_PROVEDOR nao e definido, e a validacao de ambiente o proibe em producao.
 */
export class ProvedorEmailLog implements ProvedorEmail {
  readonly nome = 'log';
  private readonly logger = new Logger('Email');

  enviar(mensagem: MensagemEmail): Promise<void> {
    this.logger.log(`Para ${mensagem.para.email} | ${mensagem.assunto}\n${mensagem.texto}`);
    return Promise.resolve();
  }
}

/**
 * Amazon SES. Com AWS_ENDPOINT_URL apontando para o MiniStack, os e-mails nao
 * saem de verdade: ficam guardados e aparecem em /_ministack/ses/messages.
 */
export class ProvedorEmailSes implements ProvedorEmail {
  readonly nome = 'ses';
  private readonly cliente: SESv2Client;
  private readonly remetente: string;

  constructor(config: Configuracao) {
    this.cliente = new SESv2Client({ region: config.aws.regiao, endpoint: config.aws.endpoint });
    this.remetente = `${config.mail.remetenteNome} <${config.mail.remetenteEmail}>`;
  }

  async enviar(mensagem: MensagemEmail): Promise<void> {
    await this.cliente.send(
      new SendEmailCommand({
        FromEmailAddress: this.remetente,
        Destination: { ToAddresses: [mensagem.para.email] },
        Content: {
          Simple: {
            Subject: { Data: mensagem.assunto, Charset: 'UTF-8' },
            Body: {
              Html: { Data: mensagem.html, Charset: 'UTF-8' },
              Text: { Data: mensagem.texto, Charset: 'UTF-8' },
            },
          },
        },
      }),
      { abortSignal: AbortSignal.timeout(TEMPO_LIMITE_MS) },
    );
  }
}

/** API transacional do Brevo, chamada direto com fetch. */
export class ProvedorEmailBrevo implements ProvedorEmail {
  readonly nome = 'brevo';

  constructor(private readonly config: Configuracao) {}

  async enviar(mensagem: MensagemEmail): Promise<void> {
    const resposta = await fetch(URL_API_BREVO, {
      method: 'POST',
      headers: {
        'api-key': this.config.mail.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.config.mail.remetenteEmail, name: this.config.mail.remetenteNome },
        to: [{ email: mensagem.para.email, name: mensagem.para.nome }],
        subject: mensagem.assunto,
        htmlContent: mensagem.html,
        textContent: mensagem.texto,
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });

    if (!resposta.ok) {
      // O corpo do erro do Brevo traz `code`/`message`, uteis no diagnostico.
      throw new Error(`Brevo respondeu ${resposta.status}: ${await resposta.text()}`);
    }
  }
}

export function criarProvedorEmail(configService: ConfigService): ProvedorEmail {
  const config = {
    mail: configService.get<Configuracao['mail']>('mail')!,
    aws: configService.get<Configuracao['aws']>('aws')!,
  } as Configuracao;

  switch (config.mail.provedor) {
    case 'ses':
      return new ProvedorEmailSes(config);
    case 'brevo':
      return new ProvedorEmailBrevo(config);
    default:
      return new ProvedorEmailLog();
  }
}
