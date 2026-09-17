import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const URL_API_BREVO = 'https://api.brevo.com/v3/smtp/email';

interface Destinatario {
  email: string;
  nome?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Envia um e-mail transacional pela API do Brevo.
   * Lanca em caso de falha; quem chama decide se o erro e fatal para a requisicao.
   */
  async enviarEmail(
    destinatario: Destinatario,
    assunto: string,
    htmlConteudo: string,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('mail.brevoApiKey')!;
    const remetenteEmail = this.configService.get<string>('mail.remetenteEmail')!;
    const remetenteNome = this.configService.get<string>('mail.remetenteNome')!;

    const resposta = await fetch(URL_API_BREVO, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: remetenteEmail, name: remetenteNome },
        to: [{ email: destinatario.email, name: destinatario.nome }],
        subject: assunto,
        htmlContent: htmlConteudo,
      }),
    });

    if (!resposta.ok) {
      // O corpo do erro do Brevo traz `code`/`message`, uteis no diagnostico.
      const detalhe = await resposta.text();
      throw new Error(`Brevo respondeu ${resposta.status}: ${detalhe}`);
    }

    this.logger.log(`E-mail "${assunto}" enviado para ${destinatario.email}`);
  }
}
