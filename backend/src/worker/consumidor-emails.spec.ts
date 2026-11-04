import { existsSync } from 'node:fs';
import { EmailRecebido, FilaEmailsService } from '../aws/fila-emails.service';
import { ProvedorEmail } from '../modules/mail/mensagem-email';
import { ARQUIVO_DE_VIDA, ConsumidorEmails } from './consumidor-emails';

const mensagem = { para: { email: 'ana@teste.com' }, assunto: 'Oi', html: '', texto: 'oi' };

const recebido = (recibo: string, extra: Partial<EmailRecebido> = {}): EmailRecebido => ({
  id: `id-${recibo}`,
  recibo,
  tentativa: 1,
  mensagem,
  ...extra,
});

function montar(receber: jest.Mock, enviar: jest.Mock = jest.fn().mockResolvedValue(undefined)) {
  const fila = { ativa: true, receber, confirmar: jest.fn().mockResolvedValue(undefined) };
  const provedor: ProvedorEmail = { nome: 'falso', enviar };
  return {
    fila,
    enviar,
    consumidor: new ConsumidorEmails(fila as unknown as FilaEmailsService, provedor),
  };
}

describe('ConsumidorEmails', () => {
  it('entrega e so entao apaga a mensagem da fila', async () => {
    const { consumidor, fila, enviar } = montar(jest.fn().mockResolvedValue([recebido('r1')]));

    await expect(consumidor.processarLote(0)).resolves.toBe(1);

    expect(enviar).toHaveBeenCalledWith(mensagem);
    expect(fila.confirmar).toHaveBeenCalledWith('r1');
    expect(existsSync(ARQUIVO_DE_VIDA)).toBe(true);
  });

  it('falha no provedor nao apaga: a mensagem volta para nova tentativa', async () => {
    const { consumidor, fila } = montar(
      jest.fn().mockResolvedValue([recebido('r1', { tentativa: 3 })]),
      jest.fn().mockRejectedValue(new Error('Brevo fora do ar')),
    );

    await expect(consumidor.processarLote(0)).resolves.toBe(0);
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('pula a mensagem que nao e e-mail, sem apagar e sem atrapalhar as outras', async () => {
    const { consumidor, fila, enviar } = montar(
      jest.fn().mockResolvedValue([recebido('r1', { mensagem: null }), recebido('r2')]),
    );

    await expect(consumidor.processarLote(0)).resolves.toBe(1);

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(fila.confirmar).toHaveBeenCalledTimes(1);
    expect(fila.confirmar).toHaveBeenCalledWith('r2');
  });

  it('falha ao ler a fila nao derruba o worker', async () => {
    jest.useFakeTimers();
    const { consumidor } = montar(jest.fn().mockRejectedValue(new Error('rede')));

    const ciclo = consumidor.processarLote(0);
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(ciclo).resolves.toBe(0);
    jest.useRealTimers();
  });

  it('no desligamento, termina e confirma o ciclo em curso antes de liberar', async () => {
    let liberarLeitura!: (lote: EmailRecebido[]) => void;
    const receber = jest.fn(
      () => new Promise<EmailRecebido[]>((resolver) => (liberarLeitura = resolver)),
    );
    const { consumidor, fila } = montar(receber);

    const execucao = consumidor.executar();
    await Promise.resolve();
    let desligou = false;
    const desligamento = consumidor.beforeApplicationShutdown().then(() => (desligou = true));

    // O long polling ainda nao voltou: o desligamento espera.
    await new Promise((resolver) => setImmediate(resolver));
    expect(desligou).toBe(false);

    liberarLeitura([recebido('r1')]);
    await desligamento;
    await execucao;

    expect(fila.confirmar).toHaveBeenCalledWith('r1');
    expect(receber).toHaveBeenCalledTimes(1);
  });

  it('sem fila configurada recusa subir', async () => {
    const fila = { ativa: false } as unknown as FilaEmailsService;
    const consumidor = new ConsumidorEmails(fila, { nome: 'x', enviar: jest.fn() });

    await expect(consumidor.executar()).rejects.toThrow('SQS_FILA_EMAILS nao configurada');
  });
});
