import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CategoriaDestino } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DestinosService } from './destinos.service';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';

describe('DestinosService', () => {
  let service: DestinosService;
  let prisma: {
    destinoCatalogo: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    destinoViagem: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      destinoCatalogo: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      destinoViagem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((promessas: unknown[]) => Promise.all(promessas)),
    };

    const modulo = await Test.createTestingModule({
      providers: [DestinosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(DestinosService);
  });

  describe('Catalogo global (RF09, RF10)', () => {
    it('busca no catalogo aplicando filtros de busca, categoria e pais', async () => {
      prisma.destinoCatalogo.findMany.mockResolvedValue([{ id: 1, nome: 'Lisboa' }]);
      prisma.destinoCatalogo.count.mockResolvedValue(1);

      const filtros = Object.assign(new BuscarDestinosDto(), {
        busca: 'Lisb',
        categoria: CategoriaDestino.CIDADE,
        pais: 'Portugal',
      });

      const resultado = await service.buscarNoCatalogo(filtros);

      expect(resultado.total).toBe(1);
      expect(resultado.itens).toHaveLength(1);
      expect(prisma.destinoCatalogo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            nome: { contains: 'Lisb', mode: 'insensitive' },
            categoria: CategoriaDestino.CIDADE,
            pais: { equals: 'Portugal', mode: 'insensitive' },
          },
        }),
      );
    });

    it('retorna destino do catalogo por id quando existe', async () => {
      const destino = { id: 1, nome: 'Lisboa', pais: 'Portugal' };
      prisma.destinoCatalogo.findUnique.mockResolvedValue(destino);

      await expect(service.buscarDoCatalogoPorId(1)).resolves.toEqual(destino);
    });

    it('lanca NotFoundException quando destino do catalogo nao existe', async () => {
      prisma.destinoCatalogo.findUnique.mockResolvedValue(null);

      await expect(service.buscarDoCatalogoPorId(999)).rejects.toThrow(NotFoundException);
    });

    it('cria destino no catalogo removendo espacos extras em nome e pais', async () => {
      prisma.destinoCatalogo.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 10, ...data }),
      );

      const criado = await service.criarNoCatalogo({
        nome: '  Porto  ',
        pais: '  Portugal  ',
        categoria: CategoriaDestino.CULTURAL,
      });

      expect(criado.nome).toBe('Porto');
      expect(criado.pais).toBe('Portugal');
    });
  });

  describe('Destinos na viagem (RF08)', () => {
    it('lista destinos da viagem ordenados por ordem de visita e chegada', async () => {
      prisma.destinoViagem.findMany.mockResolvedValue([]);

      await service.listarDaViagem('DEMO2027');

      expect(prisma.destinoViagem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { viagemId: 'DEMO2027' },
          orderBy: [{ ordem: 'asc' }, { chegada: 'asc' }],
        }),
      );
    });

    it('adiciona destino no fim do roteiro (ordem 0 quando vazio, ou ultimo + 1)', async () => {
      prisma.destinoViagem.findFirst.mockResolvedValueOnce(null);
      prisma.destinoViagem.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 1, ...data }),
      );

      const primeiro = await service.adicionarNaViagem('DEMO2027', {
        destinoCatalogoId: 1,
        chegada: '2027-01-10',
        saida: '2027-01-14',
      });
      expect(primeiro.ordem).toBe(0);

      prisma.destinoViagem.findFirst.mockResolvedValueOnce({ ordem: 2 });
      const proximo = await service.adicionarNaViagem('DEMO2027', {
        destinoCatalogoId: 2,
      });
      expect(proximo.ordem).toBe(3);
    });

    it('rejeita adicao quando a data de saida e anterior a data de chegada', async () => {
      await expect(
        service.adicionarNaViagem('DEMO2027', {
          destinoCatalogoId: 1,
          chegada: '2027-01-20',
          saida: '2027-01-10',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.destinoViagem.create).not.toHaveBeenCalled();
    });

    it('atualiza destino pertencente a viagem', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({
        viagemId: 'DEMO2027',
        chegada: new Date('2027-01-10'),
        saida: new Date('2027-01-14'),
      });
      prisma.destinoViagem.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 4, viagemId: 'DEMO2027', ...data }),
      );

      const atualizado = await service.atualizarNaViagem('DEMO2027', 4, {
        descricao: 'Roteiro atualizado',
        ordem: 1,
      });

      expect(atualizado.descricao).toBe('Roteiro atualizado');
      expect(atualizado.ordem).toBe(1);
    });

    it('rejeita atualizacao quando nova saida fica anterior a chegada ja salva', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({
        viagemId: 'DEMO2027',
        chegada: new Date('2027-01-15'),
        saida: new Date('2027-01-20'),
      });

      await expect(
        service.atualizarNaViagem('DEMO2027', 4, {
          saida: '2027-01-10',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanca NotFoundException ao tentar atualizar ou remover destino de outra viagem', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({
        viagemId: 'OUTRA123',
        chegada: null,
        saida: null,
      });

      await expect(
        service.atualizarNaViagem('DEMO2027', 4, { descricao: 'Tentativa' }),
      ).rejects.toThrow(NotFoundException);

      await expect(service.removerDaViagem('DEMO2027', 4)).rejects.toThrow(NotFoundException);
    });

    it('remove destino quando pertence a viagem', async () => {
      prisma.destinoViagem.findUnique.mockResolvedValue({
        viagemId: 'DEMO2027',
        chegada: null,
        saida: null,
      });
      prisma.destinoViagem.delete.mockResolvedValue({ id: 4 });

      await service.removerDaViagem('DEMO2027', 4);

      expect(prisma.destinoViagem.delete).toHaveBeenCalledWith({ where: { id: 4 } });
    });
  });
});
