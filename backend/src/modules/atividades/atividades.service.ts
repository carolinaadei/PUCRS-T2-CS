import { Injectable } from '@nestjs/common';
import { Prisma, StatusAtividade, TipoNotificacao } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { conflito, naoEncontrado, proibido, requisicaoInvalida } from '../../common/erros/erros';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { deDia } from '../../common/utils/formatos';
import { PrismaService } from '../../prisma/prisma.service';
import { travarViagem } from '../../prisma/travas';
import { INCLUIR_AUTOR } from '../avaliacoes/avaliacoes.mapper';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import {
  CONTAR_AVALIACOES,
  INCLUIR_CATALOGO,
  paraAtividadeDetalheDto,
  paraAtividadeViagemDto,
  paraAtividadeViagemListaDto,
  paraCatalogoAtividadeDto,
} from './atividades.mapper';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import {
  AtividadeDetalheDto,
  AtividadeViagemDto,
  AtividadeViagemListaDto,
  CatalogoAtividadeDto,
} from './dto/atividade-resposta.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import {
  AtualizarCatalogoAtividadeDto,
  CriarCatalogoAtividadeDto,
} from './dto/criar-catalogo-atividade.dto';

type Tx = Prisma.TransactionClient;

/** Avaliacoes que a pagina publica traz junto; as demais vem paginadas. */
const AVALIACOES_RECENTES = 20;

/** Instante a partir do corpo: omitido mantem, null apaga, string vira Date. */
function instanteDoCorpo(valor: string | null | undefined, atual: Date | null): Date | null {
  if (valor === undefined) return atual;
  if (valor === null) return null;

  // O Date normalizaria 2027-02-31 para 3 de marco em silencio.
  deDia(valor.slice(0, 10), 'dataHorario');
  return new Date(valor);
}

@Injectable()
export class AtividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orcamentoService: OrcamentoService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  // ---------------------- Catalogo global ----------------------

  /** Catalogo publico, ordenado pela melhor media. */
  async buscarNoCatalogo(filtros: BuscarAtividadesDto) {
    const busca = filtros.busca?.trim();
    const cidade = filtros.cidade?.trim();
    const pais = filtros.pais?.trim();

    const where: Prisma.CatalogoAtividadeWhereInput = {
      ...(busca && { nome: { contains: busca, mode: 'insensitive' } }),
      ...(filtros.tipoAtividade && { tipoAtividade: filtros.tipoAtividade }),
      ...(cidade && { cidade: { equals: cidade, mode: 'insensitive' } }),
      ...(pais && { pais: { equals: pais, mode: 'insensitive' } }),
      ...(filtros.notaMinima !== undefined && { mediaAvaliacao: { gte: filtros.notaMinima } }),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.catalogoAtividade.findMany({
        where,
        include: CONTAR_AVALIACOES,
        orderBy: [{ mediaAvaliacao: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
        skip: filtros.pular,
        take: filtros.limite,
      }),
      this.prisma.catalogoAtividade.count({ where }),
    ]);

    return new RespostaPaginada(itens.map(paraCatalogoAtividadeDto), total, filtros);
  }

  /** As atividades mais bem avaliadas, entre as que ja tem avaliacao. */
  async listarDestaques(limite = 10): Promise<CatalogoAtividadeDto[]> {
    const atividades = await this.prisma.catalogoAtividade.findMany({
      where: { avaliacoes: { some: {} } },
      include: CONTAR_AVALIACOES,
      orderBy: [{ mediaAvaliacao: 'desc' }, { avaliacoes: { _count: 'desc' } }, { id: 'asc' }],
      take: limite,
    });

    return atividades.map(paraCatalogoAtividadeDto);
  }

  /** Pagina publica da atividade, com as avaliacoes mais recentes. */
  async buscarDoCatalogo(id: number): Promise<AtividadeDetalheDto> {
    const atividade = await this.prisma.catalogoAtividade.findUnique({
      where: { id },
      include: {
        ...CONTAR_AVALIACOES,
        avaliacoes: {
          include: INCLUIR_AUTOR,
          orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
          take: AVALIACOES_RECENTES,
        },
      },
    });

    if (!atividade) {
      throw this.atividadeDoCatalogoNaoEncontrada();
    }

    return paraAtividadeDetalheDto(atividade);
  }

  async criarNoCatalogo(
    usuarioId: number,
    dto: CriarCatalogoAtividadeDto,
  ): Promise<CatalogoAtividadeDto> {
    const atividade = await this.comGooglePlaceIdUnico(() =>
      this.prisma.catalogoAtividade.create({
        data: { ...dto, fonte: 'manual', criadoPor: usuarioId },
        include: CONTAR_AVALIACOES,
      }),
    );

    return paraCatalogoAtividadeDto(atividade);
  }

  async atualizarNoCatalogo(
    usuarioId: number,
    id: number,
    dto: AtualizarCatalogoAtividadeDto,
  ): Promise<CatalogoAtividadeDto> {
    await this.garantirAutoria(usuarioId, id);

    const atividade = await this.comGooglePlaceIdUnico(() =>
      this.prisma.catalogoAtividade.update({
        where: { id },
        data: dto,
        include: CONTAR_AVALIACOES,
      }),
    );

    return paraCatalogoAtividadeDto(atividade);
  }

  /**
   * So sai do catalogo o que ninguem mais usa: nenhuma viagem agendou e
   * ninguem alem do autor avaliou. Apagar levaria junto o trabalho de outras pessoas.
   */
  async removerDoCatalogo(usuarioId: number, id: number): Promise<void> {
    await this.garantirAutoria(usuarioId, id);

    const [usosEmViagens, avaliacoesDeOutros] = await Promise.all([
      this.prisma.atividadeViagem.count({ where: { catalogoAtividadeId: id } }),
      this.prisma.avaliacao.count({
        where: { catalogoAtividadeId: id, usuarioId: { not: usuarioId } },
      }),
    ]);

    if (usosEmViagens > 0 || avaliacoesDeOutros > 0) {
      throw conflito(
        CodigoErro.CATALOGO_EM_USO,
        'A atividade esta em viagens ou tem avaliacoes de outras pessoas e nao pode ser excluida',
      );
    }

    await this.prisma.catalogoAtividade.delete({ where: { id } });
  }

  // ------------------- Atividades de uma viagem ------------------

  /** Ordem cronologica por destino: ordem de visita, depois horario. */
  async listarDaViagem(
    viagemId: string,
    destinoViagemId?: number,
  ): Promise<AtividadeViagemListaDto[]> {
    if (destinoViagemId !== undefined) {
      await this.garantirDestinoDaViagem(this.prisma, viagemId, destinoViagemId);
    }

    const atividades = await this.prisma.atividadeViagem.findMany({
      where: {
        destinoViagem: { viagemId },
        ...(destinoViagemId !== undefined && { destinoViagemId }),
      },
      include: {
        ...INCLUIR_CATALOGO,
        destinoViagem: {
          select: {
            id: true,
            ordem: true,
            destinoCatalogo: { select: { id: true, nome: true, pais: true } },
          },
        },
      },
      orderBy: [
        { destinoViagem: { ordem: 'asc' } },
        { dataHorario: { sort: 'asc', nulls: 'last' } },
        { id: 'asc' },
      ],
    });

    return atividades.map(paraAtividadeViagemListaDto);
  }

  /** Agenda uma atividade do catalogo num destino e atualiza o previsto do orcamento. */
  async adicionarNaViagem(
    viagemId: string,
    autor: UsuarioAutenticado,
    dto: AdicionarAtividadeViagemDto,
  ): Promise<AtividadeViagemDto> {
    const dataHorario = instanteDoCorpo(dto.dataHorario, null);

    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      await this.garantirDestinoDaViagem(tx, viagemId, dto.destinoViagemId);
      const catalogo = await this.atividadeDoCatalogo(dto.catalogoAtividadeId, tx);

      const atividade = await tx.atividadeViagem.create({
        data: {
          destinoViagemId: dto.destinoViagemId,
          catalogoAtividadeId: catalogo.id,
          dataHorario,
          duracaoMin: dto.duracaoMin ?? null,
          custoPrevisto: dto.custoPrevisto ?? null,
          status: dto.status ?? StatusAtividade.PENDENTE,
        },
        include: INCLUIR_CATALOGO,
      });

      await this.orcamentoService.recalcularPrevisto(tx, viagemId);
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.ATIVIDADE_ADICIONADA,
        mensagem: (nomeViagem) => `${autor.nome} adicionou ${catalogo.nome} a ${nomeViagem}`,
      });

      return paraAtividadeViagemDto(atividade);
    });
  }

  async atualizarNaViagem(
    viagemId: string,
    atividadeId: number,
    autor: UsuarioAutenticado,
    dto: AtualizarAtividadeViagemDto,
  ): Promise<AtividadeViagemDto> {
    return this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const atual = await this.atividadeDaViagem(tx, viagemId, atividadeId);

      if (dto.destinoViagemId !== undefined) {
        await this.garantirDestinoDaViagem(tx, viagemId, dto.destinoViagemId);
      }

      const atividade = await tx.atividadeViagem.update({
        where: { id: atividadeId },
        data: {
          destinoViagemId: dto.destinoViagemId,
          dataHorario: instanteDoCorpo(dto.dataHorario, atual.dataHorario),
          duracaoMin: dto.duracaoMin,
          custoPrevisto: dto.custoPrevisto,
          status: dto.status,
        },
        include: INCLUIR_CATALOGO,
      });

      await this.orcamentoService.recalcularPrevisto(tx, viagemId);
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.ATIVIDADE_ATUALIZADA,
        mensagem: (nomeViagem) =>
          `${autor.nome} atualizou ${atividade.catalogoAtividade.nome} em ${nomeViagem}`,
      });

      return paraAtividadeViagemDto(atividade);
    });
  }

  async removerDaViagem(
    viagemId: string,
    atividadeId: number,
    autor: UsuarioAutenticado,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await travarViagem(tx, viagemId);
      const atividade = await this.atividadeDaViagem(tx, viagemId, atividadeId);

      await tx.atividadeViagem.delete({ where: { id: atividadeId } });
      await this.orcamentoService.recalcularPrevisto(tx, viagemId);
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.ATIVIDADE_REMOVIDA,
        mensagem: (nomeViagem) =>
          `${autor.nome} removeu ${atividade.catalogoAtividade.nome} de ${nomeViagem}`,
      });
    });
  }

  // --------------------------- Apoio ---------------------------

  private atividadeDoCatalogoNaoEncontrada() {
    return naoEncontrado(
      CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA,
      'Atividade nao encontrada no catalogo',
    );
  }

  private async atividadeDoCatalogo(id: number, tx: Tx = this.prisma) {
    const atividade = await tx.catalogoAtividade.findUnique({
      where: { id },
      select: { id: true, nome: true, criadoPor: true },
    });

    if (!atividade) {
      throw this.atividadeDoCatalogoNaoEncontrada();
    }

    return atividade;
  }

  /** So quem cadastrou altera; itens sem autor (seed, conta excluida) ficam fixos. */
  private async garantirAutoria(usuarioId: number, id: number) {
    const atividade = await this.atividadeDoCatalogo(id);

    if (atividade.criadoPor !== usuarioId) {
      throw proibido(
        CodigoErro.APENAS_QUEM_CADASTROU,
        'So quem cadastrou esta atividade pode altera-la ou exclui-la',
      );
    }
  }

  /** Converte a violacao do indice unico de google_place_id num 409 com codigo proprio. */
  private async comGooglePlaceIdUnico<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw conflito(
          CodigoErro.GOOGLE_PLACE_ID_DUPLICADO,
          'Ja existe atividade com este googlePlaceId',
        );
      }

      throw erro;
    }
  }

  /** Impede vincular atividades a destinos de outras viagens. */
  private async garantirDestinoDaViagem(tx: Tx, viagemId: string, destinoViagemId: number) {
    const destino = await tx.destinoViagem.findUnique({
      where: { id: destinoViagemId },
      select: { viagemId: true },
    });

    if (!destino || destino.viagemId !== viagemId) {
      throw requisicaoInvalida(
        CodigoErro.DESTINO_DE_OUTRA_VIAGEM,
        'O destino informado nao pertence a esta viagem',
      );
    }
  }

  private async atividadeDaViagem(tx: Tx, viagemId: string, atividadeId: number) {
    const atividade = await tx.atividadeViagem.findUnique({
      where: { id: atividadeId },
      include: {
        destinoViagem: { select: { viagemId: true } },
        catalogoAtividade: { select: { nome: true } },
      },
    });

    if (!atividade || atividade.destinoViagem.viagemId !== viagemId) {
      throw naoEncontrado(
        CodigoErro.ATIVIDADE_NAO_ENCONTRADA,
        'Atividade nao encontrada nesta viagem',
      );
    }

    return atividade;
  }
}
