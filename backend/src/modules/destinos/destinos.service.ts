import { Injectable } from '@nestjs/common';
import { Prisma, TipoNotificacao } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { conflito, naoEncontrado, proibido, requisicaoInvalida } from '../../common/erros/erros';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { dataDoCorpo, paraDia } from '../../common/utils/formatos';
import { PrismaService } from '../../prisma/prisma.service';
import { travarViagem } from '../../prisma/travas';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import {
  paraDestinoCatalogoDto,
  paraDestinoViagemDto,
  paraDestinoViagemListaDto,
} from './destinos.mapper';
import { AdicionarDestinoViagemDto } from './dto/adicionar-destino-viagem.dto';
import { AtualizarDestinoViagemDto } from './dto/atualizar-destino-viagem.dto';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';
import {
  AtualizarDestinoCatalogoDto,
  CriarDestinoCatalogoDto,
} from './dto/criar-destino-catalogo.dto';
import {
  DestinoCatalogoDto,
  DestinoDestaqueDto,
  DestinoViagemDto,
  DestinoViagemListaDto,
} from './dto/destino-resposta.dto';

type Tx = Prisma.TransactionClient;

interface MediaDeDestino {
  id: number;
  media: number;
  total: number;
}

@Injectable()
export class DestinosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orcamentoService: OrcamentoService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  // ---------------------- Catalogo global ----------------------

  /** Catalogo publico, pesquisavel tambem por visitantes. */
  async buscarNoCatalogo(filtros: BuscarDestinosDto) {
    const busca = filtros.busca?.trim();
    const pais = filtros.pais?.trim();

    const where: Prisma.DestinoCatalogoWhereInput = {
      ...(busca && { nome: { contains: busca, mode: 'insensitive' } }),
      ...(filtros.categoria && { categoria: filtros.categoria }),
      ...(pais && { pais: { equals: pais, mode: 'insensitive' } }),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.destinoCatalogo.findMany({
        where,
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        skip: filtros.pular,
        take: filtros.limite,
      }),
      this.prisma.destinoCatalogo.count({ where }),
    ]);

    return new RespostaPaginada(itens.map(paraDestinoCatalogoDto), total, filtros);
  }

  /**
   * Destinos mais bem avaliados: a media das avaliacoes das atividades que as
   * viagens fizeram em cada destino. Cada atividade conta uma vez por destino,
   * por mais viagens que a tenham agendado ali.
   */
  async listarDestaques(limite = 10): Promise<DestinoDestaqueDto[]> {
    const medias = await this.prisma.$queryRaw<MediaDeDestino[]>`
      WITH pares AS (
        SELECT DISTINCT dv.destino_catalogo_id, av.catalogo_atividade_id
        FROM destino_viagem dv
        JOIN atividade_viagem av ON av.destino_viagem_id = dv.id
      )
      SELECT p.destino_catalogo_id AS id,
             ROUND(AVG(a.nota)::numeric, 1)::float8 AS media,
             COUNT(a.id)::int AS total
      FROM pares p
      JOIN avaliacao a ON a.catalogo_atividade_id = p.catalogo_atividade_id
      GROUP BY p.destino_catalogo_id
      ORDER BY media DESC, total DESC, p.destino_catalogo_id ASC
      LIMIT ${limite}
    `;

    const destinos = await this.prisma.destinoCatalogo.findMany({
      where: { id: { in: medias.map((media) => media.id) } },
    });
    const porId = new Map(destinos.map((destino) => [destino.id, destino]));

    return medias
      .filter((media) => porId.has(media.id))
      .map((media) => ({
        ...paraDestinoCatalogoDto(porId.get(media.id)!),
        mediaAvaliacao: Number(media.media),
        totalAvaliacoes: Number(media.total),
      }));
  }

  async buscarDoCatalogo(id: number): Promise<DestinoCatalogoDto> {
    return paraDestinoCatalogoDto(await this.destinoDoCatalogo(id));
  }

  async criarNoCatalogo(
    usuarioId: number,
    dto: CriarDestinoCatalogoDto,
  ): Promise<DestinoCatalogoDto> {
    const destino = await this.prisma.destinoCatalogo.create({
      data: { ...dto, criadoPor: usuarioId },
    });

    return paraDestinoCatalogoDto(destino);
  }

  async atualizarNoCatalogo(
    usuarioId: number,
    id: number,
    dto: AtualizarDestinoCatalogoDto,
  ): Promise<DestinoCatalogoDto> {
    await this.garantirAutoria(usuarioId, id);
    const destino = await this.prisma.destinoCatalogo.update({ where: { id }, data: dto });
    return paraDestinoCatalogoDto(destino);
  }

  async removerDoCatalogo(usuarioId: number, id: number): Promise<void> {
    await this.garantirAutoria(usuarioId, id);

    const usos = await this.prisma.destinoViagem.count({ where: { destinoCatalogoId: id } });
    if (usos > 0) {
      throw conflito(
        CodigoErro.CATALOGO_EM_USO,
        `O destino esta no roteiro de ${usos} viagem(ns) e nao pode ser excluido`,
      );
    }

    await this.prisma.destinoCatalogo.delete({ where: { id } });
  }

  // -------------------- Destinos de uma viagem -------------------

  /** Destinos da viagem na ordem de visita. */
  async listarDaViagem(viagemId: string): Promise<DestinoViagemListaDto[]> {
    const destinos = await this.prisma.destinoViagem.findMany({
      where: { viagemId },
      include: { destinoCatalogo: true, _count: { select: { atividades: true } } },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
    });

    return destinos.map(paraDestinoViagemListaDto);
  }

  /** Adiciona um destino a viagem. Sem `ordem`, entra no fim do roteiro. */
  async adicionarNaViagem(
    viagemId: string,
    autor: UsuarioAutenticado,
    dto: AdicionarDestinoViagemDto,
  ): Promise<DestinoViagemDto> {
    return this.prisma.$transaction(async (tx) => {
      // A trava serializa as mudancas de ordem: dois destinos adicionados ao
      // mesmo tempo nao disputam a mesma posicao.
      await travarViagem(tx, viagemId);
      const viagem = await this.periodoDaViagem(tx, viagemId);
      const catalogo = await this.destinoDoCatalogo(dto.destinoCatalogoId, tx);

      const chegada = dataDoCorpo(dto.chegada, null, 'chegada');
      const saida = dataDoCorpo(dto.saida, null, 'saida');
      this.validarDatas(chegada, saida, viagem);

      const ordemAtual = await this.ordemAtual(tx, viagemId);
      const criado = await tx.destinoViagem.create({
        data: {
          viagemId,
          destinoCatalogoId: catalogo.id,
          chegada,
          saida,
          descricao: dto.descricao ?? null,
          ordem: ordemAtual.length,
        },
      });

      if (dto.ordem !== undefined && dto.ordem < ordemAtual.length) {
        ordemAtual.splice(dto.ordem, 0, criado.id);
        await this.aplicarOrdem(tx, viagemId, ordemAtual);
      }

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.DESTINO_ADICIONADO,
        mensagem: (nomeViagem) =>
          `${autor.nome} adicionou ${catalogo.nome} ao roteiro de ${nomeViagem}`,
      });

      return paraDestinoViagemDto(
        await tx.destinoViagem.findUniqueOrThrow({
          where: { id: criado.id },
          include: { destinoCatalogo: true },
        }),
      );
    });
  }

  async atualizarNaViagem(
    viagemId: string,
    destinoId: number,
    autor: UsuarioAutenticado,
    dto: AtualizarDestinoViagemDto,
  ): Promise<DestinoViagemDto> {
    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const viagem = await this.periodoDaViagem(tx, viagemId);
      const atual = await this.destinoDaViagem(tx, viagemId, destinoId);

      const chegada = dataDoCorpo(dto.chegada, atual.chegada, 'chegada');
      const saida = dataDoCorpo(dto.saida, atual.saida, 'saida');
      this.validarDatas(chegada, saida, viagem);

      await tx.destinoViagem.update({
        where: { id: destinoId },
        data: { chegada, saida, ...(dto.descricao !== undefined && { descricao: dto.descricao }) },
      });

      if (dto.ordem !== undefined) {
        const ordem = (await this.ordemAtual(tx, viagemId)).filter((id) => id !== destinoId);
        ordem.splice(Math.min(dto.ordem, ordem.length), 0, destinoId);
        await this.aplicarOrdem(tx, viagemId, ordem);
      }

      const atualizado = await tx.destinoViagem.findUniqueOrThrow({
        where: { id: destinoId },
        include: { destinoCatalogo: true },
      });

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.DESTINO_ATUALIZADO,
        mensagem: (nomeViagem) =>
          `${autor.nome} atualizou ${atualizado.destinoCatalogo.nome} em ${nomeViagem}`,
      });

      return paraDestinoViagemDto(atualizado);
    });
  }

  /** Reescreve a ordem do roteiro inteiro de uma vez. */
  async reordenar(
    viagemId: string,
    autor: UsuarioAutenticado,
    destinos: number[],
  ): Promise<DestinoViagemListaDto[]> {
    await this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const atuais = await this.ordemAtual(tx, viagemId);

      const mesmoConjunto =
        destinos.length === atuais.length && destinos.every((id) => atuais.includes(id));

      if (!mesmoConjunto) {
        throw requisicaoInvalida(
          CodigoErro.ORDEM_INVALIDA,
          'Envie os ids de todos os destinos da viagem, cada um uma unica vez',
        );
      }

      await this.aplicarOrdem(tx, viagemId, destinos);
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.DESTINO_ATUALIZADO,
        mensagem: (nomeViagem) => `${autor.nome} reordenou o roteiro de ${nomeViagem}`,
      });
    });

    return this.listarDaViagem(viagemId);
  }

  /** Remove o destino, suas atividades (em cascata) e recalcula o previsto do orcamento. */
  async removerDaViagem(
    viagemId: string,
    destinoId: number,
    autor: UsuarioAutenticado,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const destino = await this.destinoDaViagem(tx, viagemId, destinoId);

      await tx.destinoViagem.delete({ where: { id: destinoId } });
      await this.aplicarOrdem(tx, viagemId, await this.ordemAtual(tx, viagemId));
      await this.orcamentoService.recalcularPrevisto(tx, viagemId);

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.DESTINO_REMOVIDO,
        mensagem: (nomeViagem) =>
          `${autor.nome} removeu ${destino.destinoCatalogo.nome} do roteiro de ${nomeViagem}`,
      });
    });
  }

  // --------------------------- Apoio ---------------------------

  private async destinoDoCatalogo(id: number, tx: Tx = this.prisma) {
    const destino = await tx.destinoCatalogo.findUnique({ where: { id } });

    if (!destino) {
      throw naoEncontrado(
        CodigoErro.DESTINO_CATALOGO_NAO_ENCONTRADO,
        'Destino nao encontrado no catalogo',
      );
    }

    return destino;
  }

  /** So quem cadastrou altera; itens sem autor (seed, conta excluida) ficam fixos. */
  private async garantirAutoria(usuarioId: number, id: number) {
    const destino = await this.destinoDoCatalogo(id);

    if (destino.criadoPor !== usuarioId) {
      throw proibido(
        CodigoErro.APENAS_QUEM_CADASTROU,
        'So quem cadastrou este destino pode altera-lo ou exclui-lo',
      );
    }
  }

  private async periodoDaViagem(tx: Tx, viagemId: string) {
    return tx.viagem.findUniqueOrThrow({
      where: { id: viagemId },
      select: { dataInicio: true, dataFim: true },
    });
  }

  /** Garante que o destino pertence a viagem cujo acesso o guard ja validou. */
  private async destinoDaViagem(tx: Tx, viagemId: string, destinoId: number) {
    const destino = await tx.destinoViagem.findUnique({
      where: { id: destinoId },
      include: { destinoCatalogo: { select: { nome: true } } },
    });

    if (!destino || destino.viagemId !== viagemId) {
      throw naoEncontrado(CodigoErro.DESTINO_NAO_ENCONTRADO, 'Destino nao encontrado nesta viagem');
    }

    return destino;
  }

  /** Chegada e saida coerentes entre si e dentro do periodo da viagem, quando ele existe. */
  private validarDatas(
    chegada: Date | null,
    saida: Date | null,
    viagem: { dataInicio: Date | null; dataFim: Date | null },
  ) {
    if (chegada && saida && saida < chegada) {
      throw requisicaoInvalida(
        CodigoErro.DESTINO_FORA_DO_PERIODO,
        'A data de saida nao pode ser anterior a data de chegada',
      );
    }

    for (const [data, campo] of [
      [chegada, 'chegada'],
      [saida, 'saida'],
    ] as const) {
      if (data && viagem.dataInicio && data < viagem.dataInicio) {
        throw requisicaoInvalida(
          CodigoErro.DESTINO_FORA_DO_PERIODO,
          `A ${campo} (${paraDia(data)}) fica antes do inicio da viagem (${paraDia(viagem.dataInicio)})`,
        );
      }

      if (data && viagem.dataFim && data > viagem.dataFim) {
        throw requisicaoInvalida(
          CodigoErro.DESTINO_FORA_DO_PERIODO,
          `A ${campo} (${paraDia(data)}) fica depois do fim da viagem (${paraDia(viagem.dataFim)})`,
        );
      }
    }
  }

  private async ordemAtual(tx: Tx, viagemId: string): Promise<number[]> {
    const destinos = await tx.destinoViagem.findMany({
      where: { viagemId },
      orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    return destinos.map((destino) => destino.id);
  }

  /** Grava `ordem` = posicao na lista, so nos destinos que mudaram de lugar. */
  private async aplicarOrdem(tx: Tx, viagemId: string, ids: number[]) {
    const atuais = await tx.destinoViagem.findMany({
      where: { viagemId },
      select: { id: true, ordem: true },
    });
    const ordemPorId = new Map(atuais.map((destino) => [destino.id, destino.ordem]));

    for (const [posicao, id] of ids.entries()) {
      if (ordemPorId.get(id) !== posicao) {
        await tx.destinoViagem.update({ where: { id }, data: { ordem: posicao } });
      }
    }
  }
}
