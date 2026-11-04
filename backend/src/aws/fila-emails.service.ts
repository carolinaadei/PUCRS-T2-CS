import {
  DeleteMessageCommand,
  GetQueueUrlCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuracao } from '../config/configuracao';
import { MensagemEmail } from '../modules/mail/mensagem-email';

export interface EmailRecebido {
  recibo: string;
  tentativa: number;
  mensagem: MensagemEmail;
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
  private readonly fila?: string;
  private url?: Promise<string>;

  constructor(config: ConfigService) {
    const aws = config.get<Configuracao['aws']>('aws')!;

    if (!aws.filaEmails) {
      return;
    }

    this.fila = aws.filaEmails;
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
      new SendMessageCommand({
        QueueUrl: await this.urlDaFila(),
        MessageBody: JSON.stringify(mensagem),
      }),
    );
  }

  /** Long polling: espera ate `esperaSegundos` por mensagens antes de voltar vazio. */
  async receber(esperaSegundos = 20, maximo = 5): Promise<EmailRecebido[]> {
    const resposta = await this.sqs().send(
      new ReceiveMessageCommand({
        QueueUrl: await this.urlDaFila(),
        MaxNumberOfMessages: maximo,
        WaitTimeSeconds: esperaSegundos,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );

    return (resposta.Messages ?? []).map((mensagem) => ({
      recibo: mensagem.ReceiptHandle!,
      tentativa: Number(mensagem.Attributes?.ApproximateReceiveCount ?? 1),
      mensagem: JSON.parse(mensagem.Body ?? '{}') as MensagemEmail,
    }));
  }

  async confirmar(recibo: string): Promise<void> {
    await this.sqs().send(
      new DeleteMessageCommand({ QueueUrl: await this.urlDaFila(), ReceiptHandle: recibo }),
    );
  }

  private sqs(): SQSClient {
    if (!this.cliente) {
      throw new Error('Fila de e-mails nao configurada (SQS_FILA_EMAILS)');
    }
    return this.cliente;
  }

  /** Aceita a URL da fila ou so o nome, que e resolvido uma vez e guardado. */
  private urlDaFila(): Promise<string> {
    if (this.fila!.startsWith('http')) {
      return Promise.resolve(this.fila!);
    }

    this.url ??= this.sqs()
      .send(new GetQueueUrlCommand({ QueueName: this.fila }))
      .then((resposta) => resposta.QueueUrl!)
      .catch((erro: unknown) => {
        // Nao guarda a falha: a proxima chamada tenta resolver de novo.
        this.url = undefined;
        throw erro;
      });

    return this.url;
  }
}
