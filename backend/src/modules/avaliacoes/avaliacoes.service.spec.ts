import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AvaliacoesService } from './avaliacoes.service';

/**
 * Testes unitarios do AvaliacoesService (Modulo 7 - RF22, RF23, RN01 e RN05).
 * Valida a criacao, atualizacao, consulta, remocao e recálculo da media de notas no catalogo.
 */
describe('AvaliacoesService', () => {
  let service: AvaliacoesService;
  let prisma: {
    catalogoAtividade: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    avaliacao: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      catalogoAtividade: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      avaliacao: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
    };

    const modulo = await Test.createTestingModule({
      providers: [AvaliacoesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(AvaliacoesService);
  });

  // ---------------------- avaliar (RF22, RN05) ----------------------

  describe('avaliar', () => {
    it('deve criar uma nova avaliacao com nota e comentario sanitizado e recalcular a media', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });
      prisma.avaliacao.upsert.mockResolvedValue({
        id: 1,
        usuarioId: 2,
        catalogoAtividadeId: 10,
        nota: 5,
        comentario: 'Experiencia fantastica!',
        criadoEm: new Date(),
        usuario: { id: 2, nome: 'Ana Souza' },
      });
      prisma.avaliacao.aggregate.mockResolvedValue({
        _avg: { nota: 4.666 },
      });

      const resultado = await service.avaliar(2, 10, {
        nota: 5,
        comentario: '  Experiencia fantastica!  ',
      });

      expect(prisma.catalogoAtividade.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        select: { id: true },
      });

      expect(prisma.avaliacao.upsert).toHaveBeenCalledWith({
        where: { usuarioId_catalogoAtividadeId: { usuarioId: 2, catalogoAtividadeId: 10 } },
        create: {
          usuarioId: 2,
          catalogoAtividadeId: 10,
          nota: 5,
          comentario: 'Experiencia fantastica!',
        },
        update: {
          nota: 5,
          comentario: 'Experiencia fantastica!',
        },
        include: { usuario: { select: { id: true, nome: true } } },
      });

      // Recalculo da media com arredondamento em 1 casa decimal (4.7)
      expect(prisma.avaliacao.aggregate).toHaveBeenCalledWith({
        where: { catalogoAtividadeId: 10 },
        _avg: { nota: true },
      });
      expect(prisma.catalogoAtividade.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { mediaAvaliacao: 4.7 },
      });

      expect(resultado).toMatchObject({
        id: 1,
        usuarioId: 2,
        catalogoAtividadeId: 10,
        nota: 5,
        comentario: 'Experiencia fantastica!',
      });
    });

    it('deve converter comentario com espacos vazios em null', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });
      prisma.avaliacao.upsert.mockResolvedValue({
        id: 1,
        usuarioId: 2,
        catalogoAtividadeId: 10,
        nota: 4,
        comentario: null,
      });
      prisma.avaliacao.aggregate.mockResolvedValue({ _avg: { nota: 4 } });

      await service.avaliar(2, 10, {
        nota: 4,
        comentario: '     ',
      });

      expect(prisma.avaliacao.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ comentario: null }),
          update: expect.objectContaining({ comentario: null }),
        }),
      );
    });

    it('deve lancar NotFoundException quando a atividade nao existir no catalogo', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue(null);

      await expect(
        service.avaliar(2, 999, {
          nota: 5,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.avaliacao.upsert).not.toHaveBeenCalled();
    });
  });

  // ---------------------- listarDaAtividade (RF23, RN01) ----------------------

  describe('listarDaAtividade', () => {
    it('deve listar as avaliacoes de uma atividade ordenadas pela mais recente', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue({ id: 10 });
      const reviews = [
        {
          id: 2,
          nota: 4,
          comentario: 'Bom',
          criadoEm: new Date('2026-10-02'),
          usuario: { id: 5, nome: 'Carlos' },
        },
        {
          id: 1,
          nota: 5,
          comentario: 'Excelente',
          criadoEm: new Date('2026-10-01'),
          usuario: { id: 3, nome: 'Beatriz' },
        },
      ];
      prisma.avaliacao.findMany.mockResolvedValue(reviews);

      const resultado = await service.listarDaAtividade(10);

      expect(prisma.catalogoAtividade.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        select: { id: true },
      });
      expect(prisma.avaliacao.findMany).toHaveBeenCalledWith({
        where: { catalogoAtividadeId: 10 },
        include: { usuario: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: 'desc' },
      });
      expect(resultado).toEqual(reviews);
    });

    it('deve lancar NotFoundException se a atividade nao existir no catalogo', async () => {
      prisma.catalogoAtividade.findUnique.mockResolvedValue(null);

      await expect(service.listarDaAtividade(999)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.avaliacao.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------------------- remover (RF22) ----------------------

  describe('remover', () => {
    it('deve remover a avaliacao com sucesso quando o usuario for o autor e recalcular a media', async () => {
      prisma.avaliacao.findUnique.mockResolvedValue({
        id: 7,
        usuarioId: 2,
        catalogoAtividadeId: 10,
      });
      prisma.avaliacao.delete.mockResolvedValue({ id: 7 });
      prisma.avaliacao.aggregate.mockResolvedValue({
        _avg: { nota: 3.5 },
      });

      await service.remover(2, 7);

      expect(prisma.avaliacao.delete).toHaveBeenCalledWith({ where: { id: 7 } });
      expect(prisma.avaliacao.aggregate).toHaveBeenCalledWith({
        where: { catalogoAtividadeId: 10 },
        _avg: { nota: true },
      });
      expect(prisma.catalogoAtividade.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { mediaAvaliacao: 3.5 },
      });
    });

    it('deve zerar a mediaAvaliacao quando a ultima avaliacao for removida', async () => {
      prisma.avaliacao.findUnique.mockResolvedValue({
        id: 7,
        usuarioId: 2,
        catalogoAtividadeId: 10,
      });
      prisma.avaliacao.delete.mockResolvedValue({ id: 7 });
      prisma.avaliacao.aggregate.mockResolvedValue({
        _avg: { nota: null },
      });

      await service.remover(2, 7);

      expect(prisma.catalogoAtividade.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { mediaAvaliacao: 0 },
      });
    });

    it('deve lancar NotFoundException quando a avaliacao nao for encontrada', async () => {
      prisma.avaliacao.findUnique.mockResolvedValue(null);

      await expect(service.remover(2, 999)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.avaliacao.delete).not.toHaveBeenCalled();
    });

    it('deve lancar ForbiddenException quando o usuario nao for o autor da avaliacao', async () => {
      prisma.avaliacao.findUnique.mockResolvedValue({
        id: 7,
        usuarioId: 5, // outro autor
        catalogoAtividadeId: 10,
      });

      await expect(service.remover(2, 7)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.avaliacao.delete).not.toHaveBeenCalled();
    });
  });
});
