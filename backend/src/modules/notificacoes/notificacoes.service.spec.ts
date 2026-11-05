import { Prisma, TipoNotificacao } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacoesService } from './notificacoes.service';

describe('NotificacoesService.registrar', () => {
  const tx = {
    viagem: { findUnique: jest.fn() },
    notificacao: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const servico = new NotificacoesService({} as PrismaService);
  const transacao = tx as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();
    tx.viagem.findUnique.mockResolvedValue({
      nome: 'Eurotrip',
      criadoPor: 1,
      membros: [{ usuarioId: 2 }, { usuarioId: 3 }],
    });
    tx.notificacao.createMany.mockImplementation(({ data }: { data: unknown[] }) =>
      Promise.resolve({ count: data.length }),
    );
  });

  it('avisa todos os participantes menos quem fez a alteracao', async () => {
    const enviadas = await servico.registrar(transacao, {
      viagemId: 'V1',
      autorId: 2,
      tipo: TipoNotificacao.DESTINO_ADICIONADO,
      mensagem: (viagem) => `Bruno adicionou Lisboa a ${viagem}`,
    });

    expect(enviadas).toBe(2);
    expect(tx.notificacao.createMany).toHaveBeenCalledWith({
      data: [1, 3].map((usuarioId) => ({
        usuarioId,
        viagemId: 'V1',
        tipo: TipoNotificacao.DESTINO_ADICIONADO,
        mensagem: 'Bruno adicionou Lisboa a Eurotrip',
      })),
    });
  });

  it('com destinatarios explicitos, avisa so eles (e nunca o autor)', async () => {
    await servico.registrar(transacao, {
      viagemId: 'V1',
      autorId: 1,
      tipo: TipoNotificacao.MEMBRO_REMOVIDO,
      destinatarios: [4, 4, 1],
      mensagem: () => 'Voce foi removido',
    });

    expect(tx.notificacao.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ usuarioId: 4 }),
    ]);
  });

  it('sem ninguem para avisar, nao grava nada', async () => {
    tx.viagem.findUnique.mockResolvedValueOnce({ nome: 'Solo', criadoPor: 1, membros: [] });

    const enviadas = await servico.registrar(transacao, {
      viagemId: 'V1',
      autorId: 1,
      tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
      mensagem: () => 'x',
    });

    expect(enviadas).toBe(0);
    expect(tx.notificacao.createMany).not.toHaveBeenCalled();
  });

  it('viagem que nao existe mais nao gera aviso', async () => {
    tx.viagem.findUnique.mockResolvedValueOnce(null);

    await expect(
      servico.registrar(transacao, {
        viagemId: 'X',
        autorId: 1,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: () => 'x',
      }),
    ).resolves.toBe(0);
  });
});
