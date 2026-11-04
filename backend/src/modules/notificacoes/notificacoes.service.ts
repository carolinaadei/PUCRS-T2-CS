import { Injectable } from '@nestjs/common';
import { Notificacao, Prisma, TipoNotificacao } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { naoEncontrado } from '../../common/erros/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { BuscarNotificacoesDto } from './dto/buscar-notificacoes.dto';
import { ContagemNotificacoesDto, NotificacaoDto } from './dto/notificacao.dto';

export interface EventoViagem {
  viagemId: string;
  /** Quem fez a alteracao: nunca e notificado sobre o que ele mesmo fez. */
  autorId: number;
  tipo: TipoNotificacao;
  /** Recebe o nome atual da viagem e devolve o texto da notificacao. */
  mensagem: (nomeViagem: string) => string;
  /** Sem esta lista, todos os participantes (criador e colaboradores) sao avisados. */
  destinatarios?: number[];
}

export const paraNotificacaoDto = (notificacao: Notificacao): NotificacaoDto => ({
  id: notificacao.id,
  viagemId: notificacao.viagemId,
  tipo: notificacao.tipo,
  mensagem: notificacao.mensagem,
  lida: notificacao.lidaEm !== null,
  lidaEm: notificacao.lidaEm,
  criadaEm: notificacao.criadaEm,
});

/**
 * Notificacoes in-app, persistidas por destinatario.
 *
 * Quem altera uma viagem chama `registrar` com o mesmo cliente de transacao da
 * alteracao: ou as duas coisas sao gravadas, ou nenhuma. Nao ha aviso perdido
 * num restart nem aviso de algo que acabou nao acontecendo.
 */
@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(tx: Prisma.TransactionClient, evento: EventoViagem): Promise<number> {
    const viagem = await tx.viagem.findUnique({
      where: { id: evento.viagemId },
      select: { nome: true, criadoPor: true, membros: { select: { usuarioId: true } } },
    });

    if (!viagem) {
      return 0;
    }

    const candidatos = evento.destinatarios ?? [
      viagem.criadoPor,
      ...viagem.membros.map((membro) => membro.usuarioId),
    ];
    const destinatarios = [...new Set(candidatos)].filter((id) => id !== evento.autorId);

    if (destinatarios.length === 0) {
      return 0;
    }

    const mensagem = evento.mensagem(viagem.nome);
    const { count } = await tx.notificacao.createMany({
      data: destinatarios.map((usuarioId) => ({
        usuarioId,
        viagemId: evento.viagemId,
        tipo: evento.tipo,
        mensagem,
      })),
    });

    return count;
  }

  async listarDoUsuario(usuarioId: number, filtro: BuscarNotificacoesDto) {
    const where: Prisma.NotificacaoWhereInput = {
      usuarioId,
      ...(filtro.apenasNaoLidas === true && { lidaEm: null }),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.notificacao.findMany({
        where,
        orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
        skip: filtro.pular,
        take: filtro.limite,
      }),
      this.prisma.notificacao.count({ where }),
    ]);

    return new RespostaPaginada(itens.map(paraNotificacaoDto), total, filtro);
  }

  async contar(usuarioId: number): Promise<ContagemNotificacoesDto> {
    const naoLidas = await this.prisma.notificacao.count({ where: { usuarioId, lidaEm: null } });
    return { naoLidas };
  }

  /** Marca (ou desmarca) uma notificacao do proprio usuario. */
  async marcar(usuarioId: number, notificacaoId: number, lida: boolean): Promise<NotificacaoDto> {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { id: notificacaoId, usuarioId },
      data: { lidaEm: lida ? new Date() : null },
    });

    if (count === 0) {
      throw naoEncontrado(CodigoErro.NOTIFICACAO_NAO_ENCONTRADA, 'Notificacao nao encontrada');
    }

    const notificacao = await this.prisma.notificacao.findUniqueOrThrow({
      where: { id: notificacaoId },
    });
    return paraNotificacaoDto(notificacao);
  }

  async marcarTodasComoLidas(usuarioId: number): Promise<{ atualizadas: number }> {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { usuarioId, lidaEm: null },
      data: { lidaEm: new Date() },
    });

    return { atualizadas: count };
  }
}
