import { existsSync } from 'node:fs';
import { FilaEmailsService } from '../aws/fila-emails.service';
import { ProvedorEmail } from '../modules/mail/mensagem-email';
import { ARQUIVO_DE_VIDA, ConsumidorEmails } from './consumidor-emails';

const mensagem = { para: { email: 'ana@teste.com' }, assunto: 'Oi', html: '', texto: 'oi' };

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
    const { consumidor, fila, enviar } = montar(
      jest.fn().mockResolvedValue([{ recibo: 'r1', tentativa: 1, mensagem }]),
    );

    await expect(consumidor.processarLote(0)).resolves.toBe(1);

    expect(enviar).toHaveBeenCalledWith(mensagem);
    expect(fila.confirmar).toHaveBeenCalledWith('r1');
    expect(existsSync(ARQUIVO_DE_VIDA)).toBe(true);
  });

  it('falha no provedor nao apaga: a mensagem volta para nova tentativa', async () => {
    const { consumidor, fila } = montar(
      jest.fn().mockResolvedValue([{ recibo: 'r1', tentativa: 3, mensagem }]),
      jest.fn().mockRejectedValue(new Error('Brevo fora do ar')),
    );

    await expect(consumidor.processarLote(0)).resolves.toBe(0);
    expect(fila.confirmar).not.toHaveBeenCalled();
  });

  it('falha ao ler a fila nao derruba o worker', async () => {
    jest.useFakeTimers();
    const { consumidor } = montar(jest.fn().mockRejectedValue(new Error('rede')));

    const ciclo = consumidor.processarLote(0);
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(ciclo).resolves.toBe(0);
    jest.useRealTimers();
  });

  it('para de consumir no desligamento', async () => {
    const receber = jest.fn().mockResolvedValue([]);
    const { consumidor } = montar(receber);
    receber.mockImplementation(() => {
      consumidor.onApplicationShutdown();
      return Promise.resolve([]);
    });

    await consumidor.executar();
    expect(receber).toHaveBeenCalledTimes(1);
  });

  it('sem fila configurada recusa subir', async () => {
    const fila = { ativa: false } as unknown as FilaEmailsService;
    const consumidor = new ConsumidorEmails(fila, { nome: 'x', enviar: jest.fn() });

    await expect(consumidor.executar()).rejects.toThrow('SQS_FILA_EMAILS nao configurada');
  });
});
