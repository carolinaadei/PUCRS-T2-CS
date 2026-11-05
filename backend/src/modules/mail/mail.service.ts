import { Inject, Injectable, Logger } from '@nestjs/common';
import { FilaEmailsService } from '../../aws/fila-emails.service';
import { MensagemEmail, PROVEDOR_EMAIL, ProvedorEmail } from './mensagem-email';

/**
 * Porta de saida de e-mails da API. Com a fila SQS configurada, so enfileira -
 * a requisicao nao espera o provedor, e uma falha de envio vira nova tentativa
 * no worker em vez de e-mail perdido. Sem fila, entrega na hora.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly fila: FilaEmailsService,
    @Inject(PROVEDOR_EMAIL) private readonly provedor: ProvedorEmail,
  ) {}

  async enviar(mensagem: MensagemEmail): Promise<void> {
    if (this.fila.ativa) {
      await this.fila.publicar(mensagem);
      this.logger.log(`E-mail "${mensagem.assunto}" enfileirado para ${mensagem.para.email}`);
      return;
    }

    await this.provedor.enviar(mensagem);
    this.logger.log(
      `E-mail "${mensagem.assunto}" entregue a ${mensagem.para.email} via ${this.provedor.nome}`,
    );
  }
}
