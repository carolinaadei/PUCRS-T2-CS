import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { BuscarNotificacoesDto } from './dto/buscar-notificacoes.dto';
import { NotificacoesInterceptor } from './notificacoes.interceptor';
import { NotificacoesService, TipoNotificacao } from './notificacoes.service';

const VIAGEM = 'DEMO2027';

describe('NotificacoesService e NotificacoesInterceptor', () => {
  let service: NotificacoesService;
  let interceptor: NotificacoesInterceptor;
  let prisma: {
    membroViagem: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      membroViagem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const modulo = await Test.createTestingModule({
      providers: [
        NotificacoesService,
        NotificacoesInterceptor,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = modulo.get(NotificacoesService);
    interceptor = modulo.get(NotificacoesInterceptor);
  });

  describe('NotificacoesService', () => {
    it('registra notificacoes sem duplicar destinatarios e lista das mais recentes para as mais antigas', () => {
      service.registrarParaUsuarios([2, 2, 3], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.DESTINO_ADICIONADO,
        mensagem: 'Destino Lisboa adicionado ao roteiro da viagem',
      });

      service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.ATIVIDADE_ADICIONADA,
        mensagem: 'Atividade Torre de Belem adicionada ao roteiro da viagem',
      });

      const pagina = service.listarDoUsuario(2);

      expect(pagina.total).toBe(2);
      expect(pagina.itens[0].tipo).toBe(TipoNotificacao.ATIVIDADE_ADICIONADA);
      expect(pagina.itens[1].tipo).toBe(TipoNotificacao.DESTINO_ADICIONADO);
      expect(pagina.itens[0].lida).toBe(false);
    });

    it('filtra apenas notificacoes nao lidas quando apenasNaoLidas e verdadeiro', () => {
      const [primeira] = service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'Primeira alteracao',
      });
      service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.ORCAMENTO_ATUALIZADO,
        mensagem: 'Segunda alteracao',
      });

      service.marcarComoLida(2, primeira.id);

      const filtroNaoLidas = new BuscarNotificacoesDto();
      filtroNaoLidas.apenasNaoLidas = true;

      const naoLidas = service.listarDoUsuario(2, filtroNaoLidas);
      expect(naoLidas.total).toBe(1);
      expect(naoLidas.itens[0].tipo).toBe(TipoNotificacao.ORCAMENTO_ATUALIZADO);

      const todas = service.listarDoUsuario(2);
      expect(todas.total).toBe(2);
    });

    it('marca uma notificacao como lida e recusa notificacao inexistente ou de outro usuario (404)', () => {
      const [criada] = service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'Viagem alterada',
      });

      const lida = service.marcarComoLida(2, criada.id);
      expect(lida.lida).toBe(true);

      expect(() => service.marcarComoLida(99, criada.id)).toThrow(
        new NotFoundException('Notificacao nao encontrada'),
      );
      expect(() => service.marcarComoLida(2, 999)).toThrow(
        new NotFoundException('Notificacao nao encontrada'),
      );
    });

    it('marca todas as notificacoes do usuario como lidas sem afetar outros usuarios', () => {
      service.registrarParaUsuarios([2, 3], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.DESTINO_ADICIONADO,
        mensagem: 'Novo destino',
      });

      service.marcarTodasComoLidas(2);

      const filtroNaoLidas = new BuscarNotificacoesDto();
      filtroNaoLidas.apenasNaoLidas = true;

      expect(service.listarDoUsuario(2, filtroNaoLidas).total).toBe(0);
      expect(service.listarDoUsuario(3, filtroNaoLidas).total).toBe(1);
    });

    it('notifica colaboradores, criador da viagem e autor da acao', async () => {
      prisma.membroViagem.findMany.mockResolvedValue([
        { usuarioId: 2, viagem: { criadoPor: 1 } },
        { usuarioId: 3, viagem: { criadoPor: 1 } },
      ]);

      const criadas = await service.notificarAlteracaoViagem({
        viagemId: VIAGEM,
        autorId: 2,
        tipo: TipoNotificacao.ATIVIDADE_ADICIONADA,
        mensagem: 'Atividade adicionada',
      });

      expect(criadas).toHaveLength(3);
      expect(service.listarDoUsuario(1).total).toBe(1);
      expect(service.listarDoUsuario(2).total).toBe(1);
      expect(service.listarDoUsuario(3).total).toBe(1);
    });

    it('retorna lista vazia quando nao ha participantes nem autor para notificar', async () => {
      prisma.membroViagem.findMany.mockResolvedValue([]);

      const criadas = await service.notificarAlteracaoViagem({
        viagemId: VIAGEM,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'Viagem atualizada',
      });

      expect(criadas).toEqual([]);
    });

    it('ignora a consulta ao banco quando membroViagem.findMany nao esta disponivel no mock', async () => {
      const servicoSemTabela = new NotificacoesService({} as unknown as PrismaService);

      const criadas = await servicoSemTabela.notificarAlteracaoViagem({
        viagemId: VIAGEM,
        autorId: 2,
        tipo: TipoNotificacao.MEMBRO_ENTROU,
        mensagem: 'Entrou',
        destinatariosExtras: [1],
      });

      expect(criadas).toHaveLength(2);
    });

    it('limpa os registros em memoria e reinicia a contagem de ids', () => {
      service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'Teste',
      });
      service.limpar();

      expect(service.listarDoUsuario(2).total).toBe(0);
      const [nova] = service.registrarParaUsuarios([2], {
        viagemId: VIAGEM,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'Novo teste',
      });
      expect(nova.id).toBe(1);
    });
  });

  describe('NotificacoesInterceptor', () => {
    function criarContexto(requisicao: Record<string, unknown>): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => requisicao,
        }),
      } as unknown as ExecutionContext;
    }

    function criarCallHandler(resposta: unknown): CallHandler {
      return {
        handle: () => of(resposta),
      };
    }

    beforeEach(() => {
      prisma.membroViagem.findMany.mockResolvedValue([{ usuarioId: 2, viagem: { criadoPor: 1 } }]);
    });

    it('gera notificacao quando destino, atividade, orcamento ou viagem sao alterados', async () => {
      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'POST',
            originalUrl: `/api/viagens/${VIAGEM}/destinos`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler({ destinoCatalogo: { nome: 'Lisboa' } }),
        ),
      );

      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'POST',
            originalUrl: `/api/viagens/${VIAGEM}/atividades`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler({ catalogoAtividade: { nome: 'Torre de Belem' } }),
        ),
      );

      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'PUT',
            originalUrl: `/api/viagens/${VIAGEM}/orcamento`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler({ valorTotal: '5000.00' }),
        ),
      );

      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'PATCH',
            originalUrl: `/api/viagens/${VIAGEM}`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler({ nome: 'Eurotrip 2027' }),
        ),
      );

      const notificacoesColaborador = service.listarDoUsuario(2);
      expect(notificacoesColaborador.total).toBe(4);
      expect(notificacoesColaborador.itens.map((n) => n.tipo)).toEqual([
        TipoNotificacao.VIAGEM_ATUALIZADA,
        TipoNotificacao.ORCAMENTO_ATUALIZADO,
        TipoNotificacao.ATIVIDADE_ADICIONADA,
        TipoNotificacao.DESTINO_ADICIONADO,
      ]);
    });

    it('cobre edicao e remocao de destinos, atividades e orcamento', () => {
      expect(
        interceptor.descreverAlteracao('PATCH', `/api/viagens/${VIAGEM}/destinos/1`, {}),
      ).toEqual({
        tipo: TipoNotificacao.DESTINO_ATUALIZADO,
        mensagem: 'Destino atualizado no roteiro da viagem',
      });

      expect(
        interceptor.descreverAlteracao('DELETE', `/api/viagens/${VIAGEM}/destinos/1`, undefined),
      ).toEqual({
        tipo: TipoNotificacao.DESTINO_REMOVIDO,
        mensagem: 'Um destino foi removido do roteiro da viagem',
      });

      expect(
        interceptor.descreverAlteracao('PATCH', `/api/viagens/${VIAGEM}/atividades/1`, {
          catalogoAtividade: { nome: 'Museu' },
        }),
      ).toEqual({
        tipo: TipoNotificacao.ATIVIDADE_ATUALIZADA,
        mensagem: 'Atividade Museu atualizada na viagem',
      });

      expect(
        interceptor.descreverAlteracao('DELETE', `/api/viagens/${VIAGEM}/atividades/1`, undefined),
      ).toEqual({
        tipo: TipoNotificacao.ATIVIDADE_REMOVIDA,
        mensagem: 'Uma atividade foi removida da viagem',
      });

      expect(
        interceptor.descreverAlteracao('DELETE', `/api/viagens/${VIAGEM}/orcamento`, undefined),
      ).toEqual({
        tipo: TipoNotificacao.ORCAMENTO_REMOVIDO,
        mensagem: 'O orcamento da viagem foi removido',
      });

      expect(
        interceptor.descreverAlteracao('PUT', `/api/viagens/${VIAGEM}/orcamento`, {
          valorTotal: 1500,
        }),
      ).toEqual({
        tipo: TipoNotificacao.ORCAMENTO_ATUALIZADO,
        mensagem: 'Orcamento da viagem definido em 1500',
      });

      expect(interceptor.descreverAlteracao('PUT', `/api/viagens/${VIAGEM}/orcamento`, {})).toEqual(
        {
          tipo: TipoNotificacao.ORCAMENTO_ATUALIZADO,
          mensagem: 'Orcamento da viagem atualizado',
        },
      );

      expect(interceptor.descreverAlteracao('POST', `/api/viagens/${VIAGEM}/destinos`, {})).toEqual(
        {
          tipo: TipoNotificacao.DESTINO_ADICIONADO,
          mensagem: 'Novo destino adicionado ao roteiro da viagem',
        },
      );

      expect(
        interceptor.descreverAlteracao('PATCH', `/api/viagens/${VIAGEM}/destinos/1`, {
          destinoCatalogo: { nome: 'Porto' },
        }),
      ).toEqual({
        tipo: TipoNotificacao.DESTINO_ATUALIZADO,
        mensagem: 'Destino Porto atualizado no roteiro da viagem',
      });

      expect(
        interceptor.descreverAlteracao('POST', `/api/viagens/${VIAGEM}/atividades`, {}),
      ).toEqual({
        tipo: TipoNotificacao.ATIVIDADE_ADICIONADA,
        mensagem: 'Nova atividade adicionada ao roteiro da viagem',
      });

      expect(
        interceptor.descreverAlteracao('PATCH', `/api/viagens/${VIAGEM}/atividades/1`, {}),
      ).toEqual({
        tipo: TipoNotificacao.ATIVIDADE_ATUALIZADA,
        mensagem: 'Atividade atualizada na viagem',
      });

      expect(interceptor.descreverAlteracao('PATCH', `/api/viagens/${VIAGEM}`, {})).toEqual({
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: 'As informacoes da viagem foram atualizadas',
      });

      expect(
        interceptor.descreverAlteracao('PUT', `/api/viagens/${VIAGEM}/destinos/1`, {}),
      ).toBeNull();
      expect(
        interceptor.descreverAlteracao('PUT', `/api/viagens/${VIAGEM}/atividades/1`, {}),
      ).toBeNull();
      expect(
        interceptor.descreverAlteracao('POST', `/api/viagens/${VIAGEM}/orcamento`, {}),
      ).toBeNull();
      expect(interceptor.descreverAlteracao('DELETE', `/api/viagens/${VIAGEM}`, {})).toBeNull();
    });

    it('ignora requisicoes GET, rotas sem :viagemId, rotas de /membros e exclusao de viagem', async () => {
      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'GET',
            originalUrl: `/api/viagens/${VIAGEM}`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler({}),
        ),
      );

      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'POST',
            originalUrl: `/api/viagens/${VIAGEM}/membros/entrar`,
            params: { viagemId: VIAGEM },
            user: { id: 2 },
          }),
          criarCallHandler({}),
        ),
      );

      await lastValueFrom(
        interceptor.intercept(
          criarContexto({
            method: 'DELETE',
            url: `/api/viagens/${VIAGEM}`,
            params: { viagemId: VIAGEM },
            user: { id: 1 },
          }),
          criarCallHandler(undefined),
        ),
      );

      expect(service.listarDoUsuario(1).total).toBe(0);
      expect(service.listarDoUsuario(2).total).toBe(0);
    });
  });
});
