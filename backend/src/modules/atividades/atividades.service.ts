import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusAtividade } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import { CriarCatalogoAtividadeDto } from './dto/criar-catalogo-atividade.dto';

/**
 * Servico responsavel pelas regras de negocio do Modulo 4 (Atividades - RF12 a RF14)
 * e do catalogo global de atividades e descoberta (RF23 a RF25).
 */
@Injectable()
export class AtividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orcamentoService: OrcamentoService,
  ) {}

  // ---------------------- Catalogo global ----------------------

  /**
   * RF24, RN01 - Consulta paginada ao catalogo publico de atividades com busca por nome
   * e filtros opcionais por tipo/categoria, cidade, pais e nota media minima.
   * @param filtros Parametros de filtragem e paginacao.
   * @returns Pagina de atividades ordenada pela maior nota media e nome.
   */
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
        orderBy: [{ mediaAvaliacao: 'desc' }, { nome: 'asc' }],
        skip: filtros.pular,
        take: filtros.limite,
      }),
      this.prisma.catalogoAtividade.count({ where }),
    ]);

    return new RespostaPaginada(itens, total, filtros);
  }

  /**
   * RF23 - Busca os detalhes publicos de uma atividade do catalogo pelo seu identificador,
   * incluindo a contagem total e as 20 avaliacoes mais recentes da comunidade.
   * @param id Identificador da atividade no catalogo.
   * @throws NotFoundException Se a atividade nao existir no catalogo.
   */
  async buscarDoCatalogoPorId(id: number) {
    const atividade = await this.prisma.catalogoAtividade.findUnique({
      where: { id },
      include: {
        avaliacoes: {
          include: { usuario: { select: { id: true, nome: true } } },
          orderBy: { criadoEm: 'desc' },
          take: 20,
        },
        _count: { select: { avaliacoes: true } },
      },
    });

    if (!atividade) {
      throw new NotFoundException('Atividade nao encontrada no catalogo');
    }

    return atividade;
  }

  /**
   * RF25 - Lista as atividades mais bem avaliadas que possuem ao menos uma avaliacao,
   * para destaque na pagina inicial.
   * @param limite Quantidade maxima de itens retornados (padrao: 10).
   */
  listarDestaques(limite = 10) {
    return this.prisma.catalogoAtividade.findMany({
      where: { avaliacoes: { some: {} } },
      orderBy: { mediaAvaliacao: 'desc' },
      take: limite,
      include: { _count: { select: { avaliacoes: true } } },
    });
  }

  /**
   * RF12, RF13 - Cadastra uma nova atividade no catalogo global (com nome, foto, tipo/categoria e local).
   * Sanitiza os campos textuais e trata duplicidade de `googlePlaceId`.
   * @param dto Dados cadastrais da atividade.
   * @throws BadRequestException Se o nome contiver apenas espacos em branco.
   * @throws ConflictException Se ja existir uma atividade com o mesmo `googlePlaceId`.
   */
  async criarNoCatalogo(dto: CriarCatalogoAtividadeDto) {
    const nome = dto.nome.trim();

    if (!nome) {
      throw new BadRequestException('O nome da atividade nao pode ficar em branco');
    }

    try {
      return await this.prisma.catalogoAtividade.create({
        data: {
          nome,
          descricao: dto.descricao?.trim() || null,
          tipoAtividade: dto.tipoAtividade,
          local: dto.local?.trim() || null,
          cidade: dto.cidade?.trim() || null,
          pais: dto.pais?.trim() || null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          googlePlaceId: dto.googlePlaceId?.trim() || null,
          fotoUrl: dto.fotoUrl?.trim() || null,
        },
      });
    } catch (erro) {
      // Converte violacao de unicidade do google_place_id em 409 Conflict amigavel.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw new ConflictException('Ja existe atividade com este googlePlaceId');
      }

      throw erro;
    }
  }

  // ------------------- Atividades de uma viagem ------------------

  /**
   * RF14 - Lista as atividades de uma viagem em ordem cronologica por destino.
   * Ordena primeiro pela ordem de visita do destino na viagem e, dentro de cada destino,
   * pela data e horario agendados (`dataHorario: 'asc'`).
   * @param viagemId Codigo identificador da viagem.
   * @param destinoViagemId Filtro opcional para listar apenas atividades de um destino especifico da viagem.
   * @throws BadRequestException Se o `destinoViagemId` informado nao pertencer a viagem.
   */
  async listarDaViagem(viagemId: string, destinoViagemId?: number) {
    if (destinoViagemId !== undefined) {
      await this.garantirDestinoDaViagem(viagemId, destinoViagemId);
    }

    return this.prisma.atividadeViagem.findMany({
      where: {
        destinoViagem: { viagemId },
        ...(destinoViagemId !== undefined && { destinoViagemId }),
      },
      include: {
        catalogoAtividade: true,
        destinoViagem: { include: { destinoCatalogo: { select: { id: true, nome: true } } } },
      },
      // Ordem de visita do destino -> ordem cronologica dentro do destino -> id para desempate deterministico.
      orderBy: [{ destinoViagem: { ordem: 'asc' } }, { dataHorario: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * RF12, RF13, RF16 - Adiciona uma atividade cadastrada no catalogo dentro de um destino da viagem,
   * registrando data/horario, duracao estimada, custo previsto e status, e recalcula o orcamento previsto.
   * @param viagemId Codigo identificador da viagem.
   * @param dto Dados do agendamento da atividade no destino.
   * @throws BadRequestException Se o destino nao pertencer a viagem ou a data for inexistente.
   * @throws NotFoundException Se a atividade informada nao existir no catalogo.
   */
  async adicionarNaViagem(viagemId: string, dto: AdicionarAtividadeViagemDto) {
    await this.garantirDestinoDaViagem(viagemId, dto.destinoViagemId);
    await this.garantirAtividadeNoCatalogo(dto.catalogoAtividadeId);

    const dataHorario = this.paraDataHorario(dto.dataHorario);

    const atividade = await this.prisma.atividadeViagem.create({
      data: {
        destinoViagemId: dto.destinoViagemId,
        catalogoAtividadeId: dto.catalogoAtividadeId,
        dataHorario,
        duracaoMin: dto.duracaoMin,
        custoPrevisto: dto.custoPrevisto,
        status: dto.status ?? StatusAtividade.PENDENTE,
      },
      include: { catalogoAtividade: true },
    });

    // RF16 - Mantem o total previsto das atividades sincronizado no orcamento da viagem.
    await this.orcamentoService.recalcularPrevisto(viagemId);

    return atividade;
  }

  /**
   * RF13, RF16, RN02 - Atualiza os dados de agendamento de uma atividade da viagem
   * (destino, data/horario, duracao estimada, custo previsto ou status) e recalcula o orcamento.
   * @param viagemId Codigo identificador da viagem.
   * @param atividadeId Identificador da atividade agendada na viagem.
   * @param dto Campos a serem atualizados.
   * @throws NotFoundException Se a atividade nao pertencer a viagem.
   * @throws BadRequestException Se o novo destino nao pertencer a viagem ou a data for inexistente.
   */
  async atualizarNaViagem(viagemId: string, atividadeId: number, dto: AtualizarAtividadeViagemDto) {
    await this.garantirAtividadeDaViagem(viagemId, atividadeId);

    if (dto.destinoViagemId !== undefined) {
      await this.garantirDestinoDaViagem(viagemId, dto.destinoViagemId);
    }

    const dataHorario =
      dto.dataHorario !== undefined ? this.paraDataHorario(dto.dataHorario) : undefined;

    const atividade = await this.prisma.atividadeViagem.update({
      where: { id: atividadeId },
      data: {
        destinoViagemId: dto.destinoViagemId,
        dataHorario,
        duracaoMin: dto.duracaoMin,
        custoPrevisto: dto.custoPrevisto,
        status: dto.status,
      },
      include: { catalogoAtividade: true },
    });

    // RF16 - Recalcula o total planejado apos alteracao de custo ou destino.
    await this.orcamentoService.recalcularPrevisto(viagemId);

    return atividade;
  }

  /**
   * RN02, RF16 - Remove uma atividade agendada na viagem e recalcula o previsto do orcamento.
   * @param viagemId Codigo identificador da viagem.
   * @param atividadeId Identificador da atividade agendada na viagem.
   * @throws NotFoundException Se a atividade nao pertencer a viagem.
   */
  async removerDaViagem(viagemId: string, atividadeId: number) {
    await this.garantirAtividadeDaViagem(viagemId, atividadeId);
    await this.prisma.atividadeViagem.delete({ where: { id: atividadeId } });
    await this.orcamentoService.recalcularPrevisto(viagemId);
  }

  /**
   * Verifica se o destino informado existe e pertence a viagem em questao.
   * Evita que um usuario vincule atividades a destinos de outras viagens.
   */
  private async garantirDestinoDaViagem(viagemId: string, destinoViagemId: number) {
    const destino = await this.prisma.destinoViagem.findUnique({
      where: { id: destinoViagemId },
      select: { viagemId: true },
    });

    if (!destino || destino.viagemId !== viagemId) {
      throw new BadRequestException('O destino informado nao pertence a esta viagem');
    }
  }

  /**
   * Verifica se a atividade referenciada existe no catalogo global antes de agenda-la no destino.
   */
  private async garantirAtividadeNoCatalogo(catalogoAtividadeId: number) {
    const atividadeCatalogo = await this.prisma.catalogoAtividade.findUnique({
      where: { id: catalogoAtividadeId },
      select: { id: true },
    });

    if (!atividadeCatalogo) {
      throw new NotFoundException('Atividade nao encontrada no catalogo');
    }
  }

  /**
   * Verifica se a atividade agendada existe e pertence a um destino da viagem informada.
   */
  private async garantirAtividadeDaViagem(viagemId: string, atividadeId: number) {
    const atividade = await this.prisma.atividadeViagem.findUnique({
      where: { id: atividadeId },
      select: { destinoViagem: { select: { viagemId: true } } },
    });

    if (!atividade || atividade.destinoViagem.viagemId !== viagemId) {
      throw new NotFoundException('Atividade nao encontrada nesta viagem');
    }
  }

  /**
   * Converte e valida uma string de data/horario ISO 8601 em objeto `Date`.
   * Rejeita datas inexistentes no calendario (ex.: 2027-02-31) que o construtor `Date`
   * do JavaScript normalizaria silenciosamente para o mes seguinte.
   */
  private paraDataHorario(valor?: string): Date | null {
    if (!valor) {
      return null;
    }

    const prefixoData = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);

    if (prefixoData) {
      const ano = Number(prefixoData[1]);
      const mes = Number(prefixoData[2]);
      const dia = Number(prefixoData[3]);
      const dataUtc = new Date(Date.UTC(ano, mes - 1, dia));

      if (
        dataUtc.getUTCFullYear() !== ano ||
        dataUtc.getUTCMonth() + 1 !== mes ||
        dataUtc.getUTCDate() !== dia
      ) {
        throw new BadRequestException('A data informada para a atividade nao existe no calendario');
      }
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      throw new BadRequestException('A data e horario devem estar em formato ISO 8601 valido');
    }

    return data;
  }
}
