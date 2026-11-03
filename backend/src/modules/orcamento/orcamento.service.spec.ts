import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, TipoAtividade } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcamentoService } from './orcamento.service';

const VIAGEM = 'A3KD9F2P';

/** Atividade como o `findMany` do resumo devolve: so custo e categoria. */
const atividade = (custo: string, tipoAtividade: TipoAtividade) => ({
  custoPrevisto: new Prisma.Decimal(custo),
  catalogoAtividade: { tipoAtividade },
});

const orcamentoDe = (valorTotal: string) => ({
  id: 1,
  viagemId: VIAGEM,
  valorTotal: new Prisma.Decimal(valorTotal),
  previstoAtividades: new Prisma.Decimal(0),
});

describe('OrcamentoService', () => {
  let service: OrcamentoService;
  let prisma: {
    orcamento: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    atividadeViagem: { aggregate: jest.Mock; findMany: jest.Mock };
  };

  const somaDosCustos = (soma: string | null) =>
    prisma.atividadeViagem.aggregate.mockResolvedValue({
      _sum: { custoPrevisto: soma === null ? null : new Prisma.Decimal(soma) },
    });

  beforeEach(async () => {
    prisma = {
      orcamento: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      atividadeViagem: { aggregate: jest.fn(), findMany: jest.fn() },
    };

    const modulo = await Test.createTestingModule({
      providers: [OrcamentoService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(OrcamentoService);
  });

  describe('definir (RF15)', () => {
    it('cria ou substitui o total ja com a soma dos custos das atividades', async () => {
      somaDosCustos('300.5');

      await service.definir(VIAGEM, { valorTotal: 1000 });

      const { where, create, update } = prisma.orcamento.upsert.mock.calls[0][0];
      expect(where).toEqual({ viagemId: VIAGEM });
      expect(create).toMatchObject({ viagemId: VIAGEM, valorTotal: 1000 });
      expect(create.previstoAtividades.toString()).toBe('300.5');
      expect(update.valorTotal).toBe(1000);
      expect(update.previstoAtividades.toString()).toBe('300.5');
    });

    it('so considera as atividades dos destinos desta viagem', async () => {
      somaDosCustos(null);

      await service.definir(VIAGEM, { valorTotal: 1000 });

      expect(prisma.atividadeViagem.aggregate.mock.calls[0][0].where).toEqual({
        destinoViagem: { viagemId: VIAGEM },
      });
    });

    it('grava previsto 0 quando nenhuma atividade tem custo', async () => {
      somaDosCustos(null);

      await service.definir(VIAGEM, { valorTotal: 1000 });

      expect(prisma.orcamento.upsert.mock.calls[0][0].create.previstoAtividades.toString()).toBe(
        '0',
      );
    });
  });

  describe('buscar (RF15)', () => {
    it('devolve o orcamento gravado', async () => {
      const gravado = orcamentoDe('1000');
      prisma.orcamento.findUnique.mockResolvedValue(gravado);

      await expect(service.buscar(VIAGEM)).resolves.toBe(gravado);
    });

    it('responde 404 enquanto a viagem nao tem orcamento', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(null);

      const busca = service.buscar(VIAGEM);
      await expect(busca).rejects.toBeInstanceOf(NotFoundException);
      await expect(busca).rejects.toThrow('Esta viagem ainda nao tem orcamento definido');
    });
  });

  describe('remover (RN02)', () => {
    it('apaga o orcamento da viagem', async () => {
      prisma.orcamento.deleteMany.mockResolvedValue({ count: 1 });

      await service.remover(VIAGEM);

      expect(prisma.orcamento.deleteMany).toHaveBeenCalledWith({ where: { viagemId: VIAGEM } });
    });

    it('responde 404 se nao havia orcamento para remover', async () => {
      prisma.orcamento.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remover(VIAGEM)).rejects.toThrow(
        'Esta viagem ainda nao tem orcamento definido',
      );
    });
  });

  describe('recalcularPrevisto (RF16)', () => {
    it('regrava a soma atual dos custos das atividades', async () => {
      somaDosCustos('480');

      await service.recalcularPrevisto(VIAGEM);

      const { where, data } = prisma.orcamento.updateMany.mock.calls[0][0];
      expect(where).toEqual({ viagemId: VIAGEM });
      expect(data.previstoAtividades.toString()).toBe('480');
    });

    it('zera o previsto quando a ultima atividade com custo sai', async () => {
      somaDosCustos(null);

      await service.recalcularPrevisto(VIAGEM);

      expect(prisma.orcamento.updateMany.mock.calls[0][0].data.previstoAtividades.toString()).toBe(
        '0',
      );
    });
  });

  describe('resumir (RF17)', () => {
    it('calcula total planejado, saldo e percentual consumido', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('12000'));
      prisma.atividadeViagem.findMany.mockResolvedValue([
        atividade('3200', TipoAtividade.HOSPEDAGEM),
        atividade('1800', TipoAtividade.TRANSPORTE),
        atividade('3400', TipoAtividade.HOSPEDAGEM),
      ]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo).toEqual({
        orcamentoDefinido: true,
        orcamentoTotal: 12000,
        totalPlanejado: 8400,
        saldoDisponivel: 3600,
        percentualConsumido: 70,
        porCategoria: [
          { tipoAtividade: TipoAtividade.HOSPEDAGEM, total: 6600, percentual: 55 },
          { tipoAtividade: TipoAtividade.TRANSPORTE, total: 1800, percentual: 15 },
        ],
      });
    });

    it('ignora atividades sem custo previsto e de outras viagens', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(null);
      prisma.atividadeViagem.findMany.mockResolvedValue([]);

      await service.resumir(VIAGEM);

      expect(prisma.atividadeViagem.findMany.mock.calls[0][0].where).toEqual({
        destinoViagem: { viagemId: VIAGEM },
        custoPrevisto: { not: null },
      });
    });

    it('soma centavos sem o erro do ponto flutuante', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('1'));
      // Em number, 0.1 + 0.2 da 0.30000000000000004.
      prisma.atividadeViagem.findMany.mockResolvedValue([
        atividade('0.1', TipoAtividade.REFEICAO),
        atividade('0.2', TipoAtividade.REFEICAO),
      ]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo.totalPlanejado).toBe(0.3);
      expect(resumo.saldoDisponivel).toBe(0.7);
      expect(resumo.percentualConsumido).toBe(30);
    });

    it('arredonda os percentuais em duas casas', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('3000'));
      prisma.atividadeViagem.findMany.mockResolvedValue([atividade('1000', TipoAtividade.PASSEIO)]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo.percentualConsumido).toBe(33.33);
      expect(resumo.porCategoria[0].percentual).toBe(33.33);
    });

    it('mostra saldo negativo e percentual acima de 100 quando o orcamento estoura', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('1000'));
      prisma.atividadeViagem.findMany.mockResolvedValue([
        atividade('1250.5', TipoAtividade.HOSPEDAGEM),
      ]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo.saldoDisponivel).toBe(-250.5);
      expect(resumo.percentualConsumido).toBe(125.05);
    });

    it('sem orcamento definido avisa e deixa total e percentuais em 0', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(null);
      prisma.atividadeViagem.findMany.mockResolvedValue([atividade('300', TipoAtividade.PASSEIO)]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo).toEqual({
        orcamentoDefinido: false,
        orcamentoTotal: 0,
        totalPlanejado: 300,
        saldoDisponivel: -300,
        percentualConsumido: 0,
        porCategoria: [{ tipoAtividade: TipoAtividade.PASSEIO, total: 300, percentual: 0 }],
      });
    });

    it('viagem sem atividades com custo devolve o painel zerado', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('5000'));
      prisma.atividadeViagem.findMany.mockResolvedValue([]);

      const resumo = await service.resumir(VIAGEM);

      expect(resumo).toMatchObject({
        totalPlanejado: 0,
        saldoDisponivel: 5000,
        percentualConsumido: 0,
        porCategoria: [],
      });
    });

    it('ordena da categoria mais cara para a mais barata, desempatando pela ordem do enum', async () => {
      prisma.orcamento.findUnique.mockResolvedValue(orcamentoDe('1000'));
      prisma.atividadeViagem.findMany.mockResolvedValue([
        atividade('100', TipoAtividade.OUTRO),
        atividade('100', TipoAtividade.TRANSPORTE),
        atividade('400', TipoAtividade.REFEICAO),
        atividade('100', TipoAtividade.PASSEIO),
      ]);

      const { porCategoria } = await service.resumir(VIAGEM);

      expect(porCategoria.map((categoria) => categoria.tipoAtividade)).toEqual([
        TipoAtividade.REFEICAO,
        TipoAtividade.PASSEIO,
        TipoAtividade.TRANSPORTE,
        TipoAtividade.OUTRO,
      ]);
    });
  });
});
