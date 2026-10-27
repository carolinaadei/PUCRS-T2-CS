import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StatusViagem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverPaisIso } from './codigo-pais';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: {
    usuario: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    viagem: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      usuario: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      viagem: {
        findMany: jest.fn(),
      },
    };

    const modulo = await Test.createTestingModule({
      providers: [UsuariosService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = modulo.get(UsuariosService);
  });

  describe('Perfil do usuario', () => {
    it('retorna os dados publicos do usuario por id', async () => {
      const perfil = {
        id: 1,
        nome: 'Ana Souza',
        email: 'ana@example.com',
        criadoEm: new Date(),
      };
      prisma.usuario.findUnique.mockResolvedValue(perfil);

      await expect(service.buscarPorId(1)).resolves.toEqual(perfil);
    });

    it('lanca NotFoundException quando usuario nao existe', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);

      await expect(service.buscarPorId(999)).rejects.toThrow(NotFoundException);
    });

    it('atualiza o nome do usuario removendo espacos nas pontas', async () => {
      prisma.usuario.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 1, nome: data.nome, email: 'ana@example.com' }),
      );

      const resultado = await service.atualizarPerfil(1, { nome: '  Ana Maria  ' });

      expect(resultado.nome).toBe('Ana Maria');
    });
  });

  describe('RF11 - Paises visitados (jsVectormap)', () => {
    it('agrega os paises das viagens CONCLUIDAS (como criador ou membro) em ISO alfa-2', async () => {
      prisma.viagem.findMany.mockResolvedValue([
        {
          id: 'VIAGEM01',
          destinos: [
            // Dois destinos no mesmo pais dentro da mesma viagem contam como 1 viagem no pais
            { destinoCatalogo: { pais: 'Portugal' } },
            { destinoCatalogo: { pais: 'Portugal' } },
            { destinoCatalogo: { pais: 'Espanha' } },
          ],
        },
        {
          id: 'VIAGEM02',
          destinos: [
            { destinoCatalogo: { pais: 'Portugal' } },
            { destinoCatalogo: { pais: 'Brasil' } },
            { destinoCatalogo: { pais: null } },
          ],
        },
      ]);

      const paises = await service.listarPaisesVisitados(7);

      expect(prisma.viagem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: StatusViagem.CONCLUIDA,
            OR: [{ criadoPor: 7 }, { membros: { some: { usuarioId: 7 } } }],
          },
        }),
      );

      expect(paises).toEqual([
        { codigo: 'PT', nome: 'Portugal', viagens: 2 },
        { codigo: 'BR', nome: 'Brasil', viagens: 1 },
        { codigo: 'ES', nome: 'Espanha', viagens: 1 },
      ]);
    });

    it('resolve siglas ISO de 2 letras, nomes sem acento e apelidos comuns', () => {
      expect(resolverPaisIso('Brasil')).toEqual({ codigo: 'BR', nome: 'Brasil' });
      expect(resolverPaisIso('Franca')).toEqual({ codigo: 'FR', nome: 'Franca' });
      expect(resolverPaisIso('EUA')).toEqual({ codigo: 'US', nome: 'EUA' });
      expect(resolverPaisIso('pt')?.codigo).toBe('PT');
      expect(resolverPaisIso('')).toBeNull();
      expect(resolverPaisIso(null)).toBeNull();
      expect(resolverPaisIso('Pais Inexistente XYZ')).toBeNull();
    });
  });
});
