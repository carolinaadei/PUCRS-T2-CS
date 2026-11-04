import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PermissaoMembro } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacoesService, TipoNotificacao } from '../notificacoes/notificacoes.service';
import { MembrosService } from './membros.service';

const VIAGEM = 'DEMO2027';

describe('MembrosService', () => {
  let service: MembrosService;
  let prisma: {
    viagem: { findUnique: jest.Mock };
    membroViagem: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let notificacoes: {
    notificarAlteracaoViagem: jest.Mock;
    registrarParaUsuarios: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      viagem: { findUnique: jest.fn() },
      membroViagem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    notificacoes = {
      notificarAlteracaoViagem: jest.fn().mockResolvedValue([]),
      registrarParaUsuarios: jest.fn().mockReturnValue([]),
    };

    const modulo = await Test.createTestingModule({
      providers: [
        MembrosService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificacoesService, useValue: notificacoes },
      ],
    }).compile();

    service = modulo.get(MembrosService);
  });

  describe('entrar', () => {
    it('adiciona o usuario como VISUALIZADOR e notifica o criador da viagem', async () => {
      prisma.viagem.findUnique.mockResolvedValue({ id: VIAGEM, criadoPor: 1 });
      prisma.membroViagem.findUnique.mockResolvedValue(null);
      prisma.membroViagem.create.mockResolvedValue({
        id: 10,
        viagemId: VIAGEM,
        usuarioId: 2,
        permissao: PermissaoMembro.VISUALIZADOR,
        entrouEm: new Date('2026-10-01T10:00:00.000Z'),
        usuario: { id: 2, nome: 'Bruno Colab', email: 'bruno@example.com' },
      });

      const resultado = await service.entrar('  demo2027 ', 2);

      expect(prisma.viagem.findUnique).toHaveBeenCalledWith({
        where: { id: VIAGEM },
        select: { id: true, criadoPor: true },
      });
      expect(prisma.membroViagem.create).toHaveBeenCalledWith({
        data: {
          viagemId: VIAGEM,
          usuarioId: 2,
          permissao: PermissaoMembro.VISUALIZADOR,
        },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });
      expect(notificacoes.notificarAlteracaoViagem).toHaveBeenCalledWith({
        viagemId: VIAGEM,
        autorId: 2,
        tipo: TipoNotificacao.MEMBRO_ENTROU,
        mensagem: 'Bruno Colab entrou na viagem como colaborador',
        destinatariosExtras: [1],
      });
      expect(resultado.permissao).toBe(PermissaoMembro.VISUALIZADOR);
    });

    it('usa mensagem padrao quando o nome do usuario nao vier no retorno', async () => {
      prisma.viagem.findUnique.mockResolvedValue({ id: VIAGEM, criadoPor: 1 });
      prisma.membroViagem.findUnique.mockResolvedValue(null);
      prisma.membroViagem.create.mockResolvedValue({
        id: 10,
        viagemId: VIAGEM,
        usuarioId: 2,
        permissao: PermissaoMembro.VISUALIZADOR,
      });

      await service.entrar(VIAGEM, 2);

      expect(notificacoes.notificarAlteracaoViagem).toHaveBeenCalledWith(
        expect.objectContaining({
          mensagem: 'Um novo colaborador entrou na viagem como colaborador',
        }),
      );
    });

    it('rejeita codigo de convite inexistente com 404', async () => {
      prisma.viagem.findUnique.mockResolvedValue(null);

      await expect(service.entrar('INEXISTE', 2)).rejects.toThrow(
        new NotFoundException('Codigo de convite invalido'),
      );
      expect(prisma.membroViagem.create).not.toHaveBeenCalled();
    });

    it('rejeita o proprio criador tentando entrar como colaborador com 409', async () => {
      prisma.viagem.findUnique.mockResolvedValue({ id: VIAGEM, criadoPor: 1 });

      await expect(service.entrar(VIAGEM, 1)).rejects.toThrow(
        new ConflictException('Voce e o criador desta viagem'),
      );
      expect(prisma.membroViagem.create).not.toHaveBeenCalled();
    });

    it('rejeita usuario que ja participa da viagem com 409', async () => {
      prisma.viagem.findUnique.mockResolvedValue({ id: VIAGEM, criadoPor: 1 });
      prisma.membroViagem.findUnique.mockResolvedValue({ id: 10 });

      await expect(service.entrar(VIAGEM, 2)).rejects.toThrow(
        new ConflictException('Voce ja participa desta viagem'),
      );
      expect(prisma.membroViagem.create).not.toHaveBeenCalled();
    });
  });

  describe('listar', () => {
    it('lista os colaboradores da viagem por ordem de entrada', async () => {
      const lista = [
        {
          id: 10,
          viagemId: VIAGEM,
          usuarioId: 2,
          permissao: PermissaoMembro.VISUALIZADOR,
          usuario: { id: 2, nome: 'Bruno', email: 'bruno@example.com' },
        },
      ];
      prisma.membroViagem.findMany.mockResolvedValue(lista);

      await expect(service.listar(VIAGEM)).resolves.toEqual(lista);
      expect(prisma.membroViagem.findMany).toHaveBeenCalledWith({
        where: { viagemId: VIAGEM },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
        orderBy: { entrouEm: 'asc' },
      });
    });
  });

  describe('definirPermissao', () => {
    it('altera a permissao do colaborador e envia notificacao in-app', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue({ viagemId: VIAGEM, usuarioId: 2 });
      prisma.membroViagem.update.mockResolvedValue({
        id: 10,
        viagemId: VIAGEM,
        usuarioId: 2,
        permissao: PermissaoMembro.EDITOR,
        usuario: { id: 2, nome: 'Bruno', email: 'bruno@example.com' },
      });

      const atualizado = await service.definirPermissao(VIAGEM, 10, PermissaoMembro.EDITOR);

      expect(atualizado.permissao).toBe(PermissaoMembro.EDITOR);
      expect(prisma.membroViagem.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { permissao: PermissaoMembro.EDITOR },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });
      expect(notificacoes.registrarParaUsuarios).toHaveBeenCalledWith([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.PERMISSAO_ALTERADA,
        mensagem: `Sua permissao na viagem ${VIAGEM} foi alterada para EDITOR`,
      });
    });

    it('rejeita quando o membro nao existe ou pertence a outra viagem (404)', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue({ viagemId: 'OUTRA123', usuarioId: 2 });

      await expect(service.definirPermissao(VIAGEM, 10, PermissaoMembro.EDITOR)).rejects.toThrow(
        new NotFoundException('Colaborador nao encontrado nesta viagem'),
      );
      expect(prisma.membroViagem.update).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    it('remove o colaborador da viagem e registra notificacao para ele', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue({ viagemId: VIAGEM, usuarioId: 2 });
      prisma.membroViagem.delete.mockResolvedValue({ id: 10 });

      await service.remover(VIAGEM, 10);

      expect(prisma.membroViagem.delete).toHaveBeenCalledWith({ where: { id: 10 } });
      expect(notificacoes.registrarParaUsuarios).toHaveBeenCalledWith([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.MEMBRO_REMOVIDO,
        mensagem: `Voce foi removido da viagem ${VIAGEM}`,
      });
    });

    it('rejeita remocao de colaborador inexistente na viagem (404)', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue(null);

      await expect(service.remover(VIAGEM, 999)).rejects.toThrow(
        new NotFoundException('Colaborador nao encontrado nesta viagem'),
      );
      expect(prisma.membroViagem.delete).not.toHaveBeenCalled();
    });
  });

  describe('sair', () => {
    it('permite ao colaborador sair da viagem e notifica os demais participantes', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue({
        id: 10,
        viagem: { criadoPor: 1 },
      });
      prisma.membroViagem.delete.mockResolvedValue({ id: 10 });

      await service.sair(VIAGEM, 2);

      expect(prisma.membroViagem.delete).toHaveBeenCalledWith({ where: { id: 10 } });
      expect(notificacoes.notificarAlteracaoViagem).toHaveBeenCalledWith({
        viagemId: VIAGEM,
        autorId: 2,
        tipo: TipoNotificacao.MEMBRO_SAIU,
        mensagem: `Um colaborador saiu da viagem ${VIAGEM}`,
        destinatariosExtras: [1],
      });
    });

    it('funciona quando o vinculo nao traz os dados da viagem aninhados', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue({ id: 10 });
      prisma.membroViagem.delete.mockResolvedValue({ id: 10 });

      await service.sair(VIAGEM, 2);

      expect(notificacoes.notificarAlteracaoViagem).toHaveBeenCalledWith(
        expect.objectContaining({
          destinatariosExtras: [],
        }),
      );
    });

    it('impede o criador de sair da propria viagem com 400', async () => {
      prisma.membroViagem.findUnique.mockResolvedValue(null);

      await expect(service.sair(VIAGEM, 1)).rejects.toThrow(
        new BadRequestException('O criador da viagem nao pode sair dela; exclua a viagem'),
      );
      expect(prisma.membroViagem.delete).not.toHaveBeenCalled();
    });
  });
});
