import { Injectable, NotFoundException } from '@nestjs/common';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { BuscarNotificacoesDto } from './dto/buscar-notificacoes.dto';
import { NotificacaoDto } from './dto/notificacao.dto';

export enum TipoNotificacao {
  VIAGEM_ATUALIZADA = 'VIAGEM_ATUALIZADA',
  DESTINO_ADICIONADO = 'DESTINO_ADICIONADO',
  DESTINO_ATUALIZADO = 'DESTINO_ATUALIZADO',
  DESTINO_REMOVIDO = 'DESTINO_REMOVIDO',
  ATIVIDADE_ADICIONADA = 'ATIVIDADE_ADICIONADA',
  ATIVIDADE_ATUALIZADA = 'ATIVIDADE_ATUALIZADA',
  ATIVIDADE_REMOVIDA = 'ATIVIDADE_REMOVIDA',
  ORCAMENTO_ATUALIZADO = 'ORCAMENTO_ATUALIZADO',
  ORCAMENTO_REMOVIDO = 'ORCAMENTO_REMOVIDO',
  MEMBRO_ENTROU = 'MEMBRO_ENTROU',
  PERMISSAO_ALTERADA = 'PERMISSAO_ALTERADA',
  MEMBRO_REMOVIDO = 'MEMBRO_REMOVIDO',
  MEMBRO_SAIU = 'MEMBRO_SAIU',
}

interface RegistroNotificacao extends NotificacaoDto {
  usuarioId: number;
}

export interface DadosNovaNotificacao {
  viagemId: string;
  tipo: string;
  mensagem: string;
}

export interface EventoAlteracaoViagem extends DadosNovaNotificacao {
  autorId?: number;
  destinatariosExtras?: number[];
}

@Injectable()
export class NotificacoesService {
  private readonly registros: RegistroNotificacao[] = [];
  private proximoId = 1;

  constructor(private readonly prisma: PrismaService) {}

  /** Lista as notificacoes do usuario, mais recentes primeiro, com filtro opcional de nao lidas. */
  listarDoUsuario(
    usuarioId: number,
    filtro: BuscarNotificacoesDto = new BuscarNotificacoesDto(),
  ): RespostaPaginada<NotificacaoDto> {
    const filtradas = this.registros
      .filter(
        (item) =>
          item.usuarioId === usuarioId && (filtro.apenasNaoLidas === true ? !item.lida : true),
      )
      .sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime() || b.id - a.id);

    const total = filtradas.length;
    const itens = filtradas
      .slice(filtro.pular, filtro.pular + filtro.limite)
      .map((item) => this.paraDto(item));

    return new RespostaPaginada(itens, total, filtro);
  }

  /** Marca como lidas todas as notificacoes do usuario autenticado. */
  marcarTodasComoLidas(usuarioId: number): void {
    for (const item of this.registros) {
      if (item.usuarioId === usuarioId) {
        item.lida = true;
      }
    }
  }

  /** Marca uma notificacao especifica como lida; exige que pertenca ao destinatario. */
  marcarComoLida(usuarioId: number, notificacaoId: number): NotificacaoDto {
    const registro = this.registros.find(
      (item) => item.id === notificacaoId && item.usuarioId === usuarioId,
    );

    if (!registro) {
      throw new NotFoundException('Notificacao nao encontrada');
    }

    registro.lida = true;
    return this.paraDto(registro);
  }

  /** Registra notificacoes diretamente para os destinatarios informados. */
  registrarParaUsuarios(destinatariosIds: number[], dados: DadosNovaNotificacao): NotificacaoDto[] {
    const unicos = Array.from(new Set(destinatariosIds));
    const criadas: NotificacaoDto[] = [];

    for (const usuarioId of unicos) {
      const registro: RegistroNotificacao = {
        id: this.proximoId++,
        usuarioId,
        viagemId: dados.viagemId,
        tipo: dados.tipo,
        mensagem: dados.mensagem,
        lida: false,
        criadaEm: new Date(),
      };
      this.registros.push(registro);
      criadas.push(this.paraDto(registro));
    }

    return criadas;
  }

  /**
   * Notifica todos os participantes da viagem (colaboradores e criador),
   * exceto o proprio autor da alteracao.
   */
  async notificarAlteracaoViagem(evento: EventoAlteracaoViagem): Promise<NotificacaoDto[]> {
    const participantes = await this.buscarParticipantesDaViagem(evento.viagemId);
    const todos = new Set<number>([...participantes, ...(evento.destinatariosExtras ?? [])]);

    if (typeof evento.autorId === 'number') {
      todos.delete(evento.autorId);
    }

    if (todos.size === 0) {
      return [];
    }

    return this.registrarParaUsuarios(Array.from(todos), {
      viagemId: evento.viagemId,
      tipo: evento.tipo,
      mensagem: evento.mensagem,
    });
  }

  /** Limpa o estado em memoria (util em testes). */
  limpar(): void {
    this.registros.length = 0;
    this.proximoId = 1;
  }

  private async buscarParticipantesDaViagem(viagemId: string): Promise<number[]> {
    if (typeof this.prisma.membroViagem?.findMany !== 'function') {
      return [];
    }

    const vinculos = await this.prisma.membroViagem.findMany({
      where: { viagemId },
      select: {
        usuarioId: true,
        viagem: { select: { criadoPor: true } },
      },
    });

    if (!Array.isArray(vinculos) || vinculos.length === 0) {
      return [];
    }

    const ids = new Set<number>();
    for (const vinculo of vinculos) {
      if (typeof vinculo.usuarioId === 'number') {
        ids.add(vinculo.usuarioId);
      }
      if (typeof vinculo.viagem?.criadoPor === 'number') {
        ids.add(vinculo.viagem.criadoPor);
      }
    }

    return Array.from(ids);
  }

  private paraDto(registro: RegistroNotificacao): NotificacaoDto {
    return {
      id: registro.id,
      viagemId: registro.viagemId,
      tipo: registro.tipo,
      mensagem: registro.mensagem,
      lida: registro.lida,
      criadaEm: registro.criadaEm,
    };
  }
}
