import { BeforeApplicationShutdown, Inject, Injectable, Logger } from '@nestjs/common';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FilaEmailsService } from '../aws/fila-emails.service';
import { PROVEDOR_EMAIL, ProvedorEmail } from '../modules/mail/mensagem-email';

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Tocado a cada ciclo da fila. O healthcheck do container considera o worker
 * vivo enquanto o arquivo tiver menos de um minuto: um loop travado aparece
 * como unhealthy, coisa que "o processo existe" nao mostraria.
 */
export const ARQUIVO_DE_VIDA = join(tmpdir(), 'viajajunto-worker-vivo');

/**
 * Consome a fila de e-mails e entrega cada um pelo provedor configurado.
 *
 * So apaga a mensagem depois que o envio deu certo. Se o provedor falhar - ou
 * se a mensagem nem for um e-mail -, ela reaparece na fila quando o
 * VisibilityTimeout vence; na terceira vez o SQS a move para a DLQ
 * (RedrivePolicy da pilha).
 */
@Injectable()
export class ConsumidorEmails implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ConsumidorEmails.name);
  private ativo = true;
  private cicloAtual?: Promise<number>;

  constructor(
    private readonly fila: FilaEmailsService,
    @Inject(PROVEDOR_EMAIL) private readonly provedor: ProvedorEmail,
  ) {}

  async executar(): Promise<void> {
    if (!this.fila.ativa) {
      throw new Error('SQS_FILA_EMAILS nao configurada: o worker nao tem o que consumir');
    }

    this.logger.log(`Consumindo a fila de e-mails; entrega via ${this.provedor.nome}`);

    while (this.ativo) {
      this.cicloAtual = this.processarLote();
      await this.cicloAtual;
    }

    this.logger.log('Worker encerrado');
  }

  /** Um ciclo de long polling. Devolve quantas mensagens foram entregues. */
  async processarLote(esperaSegundos = 10): Promise<number> {
    writeFileSync(ARQUIVO_DE_VIDA, new Date().toISOString());

    let recebidos;
    try {
      recebidos = await this.fila.receber(esperaSegundos);
    } catch (erro) {
      this.logger.error(`Falha ao ler a fila: ${String(erro)}`);
      await esperar(5_000);
      return 0;
    }

    let entregues = 0;
    for (const { id, recibo, tentativa, mensagem } of recebidos) {
      if (!mensagem) {
        this.logger.warn(`Mensagem ${id} nao e um e-mail completo; segue para a DLQ`);
        continue;
      }

      try {
        await this.provedor.enviar(mensagem);
        await this.fila.confirmar(recibo);
        entregues++;
        this.logger.log(`E-mail "${mensagem.assunto}" entregue a ${mensagem.para.email}`);
      } catch (erro) {
        this.logger.warn(
          `Falha na tentativa ${tentativa} de entregar a ${mensagem.para.email}: ${String(erro)}`,
        );
      }
    }

    return entregues;
  }

  /**
   * O Nest espera este hook antes de encerrar o processo: o ciclo em curso
   * termina e confirma o que entregou. Sem esperar, um `docker stop` no meio do
   * envio deixaria o e-mail sem confirmar, e ele seria enviado de novo.
   */
  async beforeApplicationShutdown(): Promise<void> {
    this.ativo = false;
    await this.cicloAtual;
  }
}
