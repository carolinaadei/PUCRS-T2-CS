import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuracao } from '../config/configuracao';
import { lerMensagemEmail, MensagemEmail } from '../modules/mail/mensagem-email';

export interface EmailRecebido {
  id: string;
  recibo: string;
  tentativa: number;
  /** null quando o corpo nao e um e-mail completo. */
  mensagem: MensagemEmail | null;
}

/**
 * Fila SQS de e-mails a enviar. A API so publica; quem envia de fato e o worker
 * (`node dist/worker`), que consome a fila. Se o envio falhar, a mensagem volta
 * para a fila e e tentada de novo; depois de 3 falhas vai para a DLQ, onde fica
 * para investigacao em vez de sumir.
 */
@Injectable()
export class FilaEmailsService {
  private readonly cliente?: SQSClient;
  private readonly url?: string;

  constructor(config: ConfigService) {
    const aws = config.get<Configuracao['aws']>('aws')!;

    if (!aws.filaEmails) {
      return;
    }

    this.url = aws.filaEmails;
    this.cliente = new SQSClient({
      region: aws.regiao,
      endpoint: aws.endpoint,
      // A URL que o MiniStack devolve usa o host dele (localhost), que nao
      // resolve dentro do compose. Com endpoint proprio, ele e quem manda.
      useQueueUrlAsEndpoint: !aws.endpoint,
    });
  }

  /** Sem SQS_FILA_EMAILS a API envia o e-mail na hora, sem fila. */
  get ativa(): boolean {
    return this.cliente !== undefined;
  }

  async publicar(mensagem: MensagemEmail): Promise<void> {
    await this.sqs().send(
      new SendMessageCommand({ QueueUrl: this.url, MessageBody: JSON.stringify(mensagem) }),
    );
  }

  /** Long polling: espera ate `esperaSegundos` por mensagens antes de voltar vazio. */
  async receber(esperaSegundos = 20, maximo = 5): Promise<EmailRecebido[]> {
    const resposta = await this.sqs().send(
      new ReceiveMessageCommand({
        QueueUrl: this.url,
        MaxNumberOfMessages: maximo,
        WaitTimeSeconds: esperaSegundos,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );

    return (resposta.Messages ?? []).map((mensagem) => ({
      id: mensagem.MessageId ?? '?',
      recibo: mensagem.ReceiptHandle!,
      tentativa: Number(mensagem.Attributes?.ApproximateReceiveCount ?? 1),
      mensagem: lerMensagemEmail(mensagem.Body),
    }));
  }

  async confirmar(recibo: string): Promise<void> {
    await this.sqs().send(new DeleteMessageCommand({ QueueUrl: this.url, ReceiptHandle: recibo }));
  }

  private sqs(): SQSClient {
    if (!this.cliente) {
      throw new Error('Fila de e-mails nao configurada (SQS_FILA_EMAILS)');
    }
    return this.cliente;
  }
}
