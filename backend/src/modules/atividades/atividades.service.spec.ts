import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, StatusAtividade, TipoAtividade } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { AtividadesService } from './atividades.service';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';

/**
 * Testes unitarios do AtividadesService (Modulo 4 - RF12 a RF14 e RF23 a RF25).
 * Verifica as regras de negocio de cadastro no catalogo, agendamento em destinos,
 * listagem cronologica por destino, atualizacao de status/custos e sincronizacao com orcamento (RF16).
 */
describe('AtividadesService', () => {
  let service: AtividadesService;
  let prisma: {
    catalogoAtividade: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    atividadeViagem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    destinoViagem: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let orcamentoService: {
    recalcularPrevisto: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      catalogoAtividade: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      atividadeViagem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      destinoViagem: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    };

    orcamentoService = {
      recalcularPrevisto: jest.fn().mockResolvedValue(undefined),
    };

    const modulo = await Test.createTestingModule({
      providers: [
        AtividadesService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrcamentoService, useValue: orcamentoService },
      ],
    }).compile();

    service = modulo.get(AtividadesService);
  });

  // ---------------------- Catalogo global ----------------------

  describe('criarNoCatalogo (RF12, RF13)', () => {
    it('cadastra atividade no catalogo aplicando trim nos campos de texto', async () => {
      prisma.catalogoAtividade.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const criada = await service.criarNoCatalogo({
        nome: '  Torre de Belem  ',
        descricao: '  Monumento historico  ',
        tipoAtividade: TipoAtividade.PASSEIO,
        local: '  Av. Brasilia  ',
        cidade: '  Lisboa  ',
        pais: '  Portugal  ',
        fotoUrl: 'https://exemplo.com/torre.jpg',
      });

      expect(criada).toMatchObject({
        id: 1,
        nome: 'Torre de Belem',
        descricao: 'Monumento historico',
        tipoAtividade: TipoAtividade.PASSEIO,
        local: 'Av. Brasilia',
        cidade: 'Lisboa',
        pais: 'Portugal',
        fotoUrl: 'https://exemplo.com/torre.jpg',
      });
    });

    it('rejeita nome composto apenas por espacos em branco', async () => {
      await expect(
        service.criarNoCatalogo({
          nome: '    ',
          tipoAtividade: TipoAtividade.REFEICAO,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.catalogoAtividade.create).not.toHaveBeenCalled();
    });

    it('traduz violacao de unicidade do googlePlaceId (P2002) em ConflictException', async () => {
      const erroDuplicado = new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'teste',
      });
      prisma.catalogoAtividade.create.mockRejectedValue(erroDuplicado);

      await expect(
        service.criarNoCatalogo({
          nome: 'Torre de Belem',
          tipoAtividade: TipoAtividade.PASSEIO,
          googlePlaceId: 'ChIJ1Ww5Hc80GQ0RXkYcB6Ew3xE',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('buscarNoCatalogo (RF24)', () => {
    it('aplica filtros de busca, tipo, localizacao e nota minima com paginacao', async () => {
      prisma.catalogoAtividade.findMany.mockResolvedValue([]);
      prisma.catalogoAtividade.count.mockResolvedValue(0);

      const filtros = Object.assign(new BuscarAtividadesDto(), {
        busca: '  Torre  ',
        tipoAtividade: TipoAtividade.PASSEIO,
        cidade: '  Lisboa ',
        pais: ' Portugal ',
        notaMinima: 4,
      });

      const pagina = await service.buscarNoCatalogo(filtros);

      const chamada = prisma.catalogoAtividade.findMany.mock.calls[0][0];
      expect(chamada.where).toEqual({
        nome: { contains: 'Torre', mode: 'insensitive' },
        tipoAtividade: TipoAtividade.PASSEIO,
        cidade: { equals: 'Lisboa', mode: 'insensitive' },
        pais: { equals: 'Portugal', mode: 'insensitive' },
        mediaAvaliacao: { gte: 4 },
      });
      expect(chamada.orderBy).toEqual([{ mediaAvaliacao: 'desc' }, { nome: 'asc' }]);
      expect(pagina.total).toBe(0);
    });
  });

  describe('buscarDoCatalogoPorId e listarDestaques (RF23, RF25)', () => {
    it('retorna os detalhes da atividade do catalogo quando encontrada', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue({
        id: 5,
        nome: 'Mosteiro dos Jeronimos',
        avaliacoes: [],
      });

      const resultado = await service.buscarDoCatalogoPorId(5);
      expect(resultado.id).toBe(5);
    });

    it('lanca NotFoundException quando a atividade nao existe no catalogo', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue(null);

      await expect(service.buscarDoCatalogoPorId(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lista apenas atividades avaliadas ordenadas pela maior media nos destaques', async () => {
      prisma.catalogoAtividade.findMany.mockResolvedValue([]);

      await service.listarDestaques(5);

      expect(prisma.catalogoAtividade.findMany).toHaveBeenCalledWith({
        where: { avaliacoes: { some: {} } },
        orderBy: { mediaAvaliacao: 'desc' },
        take: 5,
        include: { _count: { select: { avaliacoes: true } } },
      });
    });
  });

  // ------------------- Atividades de uma viagem ------------------

  describe('adicionarNaViagem (RF12, RF13, RF16)', () => {
    it('agenda atividade dentro do destino, define status PENDENTE por padrao e recalcula orcamento', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prisma.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });
      prisma.atividadeViagem.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 100, ...data }),
      );

      const agendada = await service.adicionarNaViagem('EURO2027', {
        destinoViagemId: 3,
        catalogoAtividadeId: 10,
        dataHorario: '2027-01-12T14:30:00.000Z',
        duracaoMin: 120,
        custoPrevisto: 180.5,
      });

      expect(agendada).toMatchObject({
        id: 100,
        destinoViagemId: 3,
        catalogoAtividadeId: 10,
        duracaoMin: 120,
        custoPrevisto: 180.5,
        status: StatusAtividade.PENDENTE,
      });
      expect(agendada.dataHorario?.toISOString()).toBe('2027-01-12T14:30:00.000Z');
      expect(orcamentoService.recalcularPrevisto).toHaveBeenCalledWith('EURO2027');
    });

    it('rejeita quando o destino informado pertence a outra viagem ou nao existe', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'OUTRA123' });

      await expect(
        service.adicionarNaViagem('EURO2027', {
          destinoViagemId: 3,
          catalogoAtividadeId: 10,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.atividadeViagem.create).not.toHaveBeenCalled();
      expect(orcamentoService.recalcularPrevisto).not.toHaveBeenCalled();
    });

    it('rejeita com NotFoundException quando a atividade nao existe no catalogo', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prisma.catalogoAtividade.findUnique.mockResolvedValue(null);

      await expect(
        service.adicionarNaViagem('EURO2027', {
          destinoViagemId: 3,
          catalogoAtividadeId: 999,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.atividadeViagem.create).not.toHaveBeenCalled();
    });

    it('rejeita data inexistente no calendario (ex.: 31 de fevereiro)', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prisma.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });

      await expect(
        service.adicionarNaViagem('EURO2027', {
          destinoViagemId: 3,
          catalogoAtividadeId: 10,
          dataHorario: '2027-02-31T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.atividadeViagem.create).not.toHaveBeenCalled();
    });
  });

  describe('listarDaViagem (RF14)', () => {
    it('lista atividades ordenadas pela ordem do destino e pelo horario cronologico', async () => {
      prisma.atividadeViagem.findMany.mockResolvedValue([]);

      await service.listarDaViagem('EURO2027');

      expect(prisma.atividadeViagem.findMany).toHaveBeenCalledWith({
        where: { destinoViagem: { viagemId: 'EURO2027' } },
        include: {
          catalogoAtividade: true,
          destinoViagem: { include: { destinoCatalogo: { select: { id: true, nome: true } } } },
        },
        orderBy: [{ destinoViagem: { ordem: 'asc' } }, { dataHorario: 'asc' }, { id: 'asc' }],
      });
    });

    it('filtra por destinoViagemId especifico quando pertence a viagem', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'EURO2027' });
      prisma.atividadeViagem.findMany.mockResolvedValue([]);

      await service.listarDaViagem('EURO2027', 4);

      const chamada = prisma.atividadeViagem.findMany.mock.calls[0][0];
      expect(chamada.where).toEqual({
        destinoViagem: { viagemId: 'EURO2027' },
        destinoViagemId: 4,
      });
    });

    it('rejeita filtro destinoViagemId que nao pertence a viagem', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'OUTRA123' });

      await expect(service.listarDaViagem('EURO2027', 4)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.atividadeViagem.findMany).not.toHaveBeenCalled();
    });
  });

  describe('atualizarNaViagem e removerDaViagem (RF13, RF16, RN02)', () => {
    it('atualiza status, horario e custo previsto e recalcula o orcamento', async () => {
      prisma.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'EURO2027' },
      });
      prisma.atividadeViagem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 100, ...data }),
      );

      const atualizada = await service.atualizarNaViagem('EURO2027', 100, {
        custoPrevisto: 320,
        status: StatusAtividade.CONFIRMADA,
        dataHorario: '2027-01-13T09:00:00.000Z',
      });

      expect(atualizada.status).toBe(StatusAtividade.CONFIRMADA);
      expect(atualizada.custoPrevisto).toBe(320);
      expect(orcamentoService.recalcularPrevisto).toHaveBeenCalledWith('EURO2027');
    });

    it('valida o novo destinoViagemId quando a atividade e movida de destino', async () => {
      prisma.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'EURO2027' },
      });
      prisma.destinoViagem.findUnique.mockResolvedValue({ viagemId: 'OUTRA123' });

      await expect(
        service.atualizarNaViagem('EURO2027', 100, { destinoViagemId: 99 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lanca NotFoundException ao tentar editar ou remover atividade de outra viagem', async () => {
      prisma.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'OUTRA123' },
      });

      await expect(
        service.atualizarNaViagem('EURO2027', 100, { status: StatusAtividade.CONCLUIDA }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(service.removerDaViagem('EURO2027', 100)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove a atividade da viagem e recalcula o previsto do orcamento', async () => {
      prisma.atividadeViagem.findUnique.mockResolvedValue({
        destinoViagem: { viagemId: 'EURO2027' },
      });
      prisma.atividadeViagem.delete.mockResolvedValue({ id: 100 });

      await service.removerDaViagem('EURO2027', 100);

      expect(prisma.atividadeViagem.delete).toHaveBeenCalledWith({ where: { id: 100 } });
      expect(orcamentoService.recalcularPrevisto).toHaveBeenCalledWith('EURO2027');
    });
  });
});
