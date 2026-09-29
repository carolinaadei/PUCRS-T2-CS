import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { OrcamentoService } from '../orcamento/orcamento.service';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import { CriarCatalogoAtividadeDto } from './dto/criar-catalogo-atividade.dto';

@Injectable()
export class AtividadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orcamentoService: OrcamentoService,
  ) {}

  // ---------------------- Catalogo global ----------------------

  /** RF24, RN01 - catalogo publico com busca e filtros. */
  async buscarNoCatalogo(filtros: BuscarAtividadesDto) {
    const where: Prisma.CatalogoAtividadeWhereInput = {
      ...(filtros.busca && { nome: { contains: filtros.busca, mode: 'insensitive' } }),
      ...(filtros.tipoAtividade && { tipoAtividade: filtros.tipoAtividade }),
      ...(filtros.cidade && { cidade: { equals: filtros.cidade, mode: 'insensitive' } }),
      ...(filtros.pais && { pais: { equals: filtros.pais, mode: 'insensitive' } }),
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

  /** RF23 - pagina publica da atividade, com media e reviews. */
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

  /** RF25 - atividades mais bem avaliadas para a pagina inicial. */
  listarDestaques(limite = 10) {
    return this.prisma.catalogoAtividade.findMany({
      where: { avaliacoes: { some: {} } },
      orderBy: { mediaAvaliacao: 'desc' },
      take: limite,
      include: { _count: { select: { avaliacoes: true } } },
    });
  }

  criarNoCatalogo(dto: CriarCatalogoAtividadeDto) {
    return this.prisma.catalogoAtividade.create({ data: dto });
  }

  // ------------------- Atividades de uma viagem ------------------

  /** RF14 - atividades da viagem em ordem cronologica, agrupaveis por destino. */
  listarDaViagem(viagemId: string, destinoViagemId?: number) {
    return this.prisma.atividadeViagem.findMany({
      where: {
        destinoViagem: { viagemId },
        ...(destinoViagemId && { destinoViagemId }),
      },
      include: {
        catalogoAtividade: true,
        destinoViagem: { include: { destinoCatalogo: { select: { id: true, nome: true } } } },
      },
      orderBy: [{ destinoViagem: { ordem: 'asc' } }, { dataHorario: 'asc' }],
    });
  }

  /** RF12, RF13 - agenda a atividade e atualiza o previsto do orcamento (RF16). */
  async adicionarNaViagem(viagemId: string, dto: AdicionarAtividadeViagemDto) {
    await this.garantirDestinoDaViagem(viagemId, dto.destinoViagemId);

    const atividade = await this.prisma.atividadeViagem.create({
      data: {
        destinoViagemId: dto.destinoViagemId,
        catalogoAtividadeId: dto.catalogoAtividadeId,
        dataHorario: dto.dataHorario ? new Date(dto.dataHorario) : null,
        duracaoMin: dto.duracaoMin,
        custoPrevisto: dto.custoPrevisto,
        status: dto.status,
      },
      include: { catalogoAtividade: true },
    });

    await this.orcamentoService.recalcularPrevisto(viagemId);

    return atividade;
  }

  async atualizarNaViagem(viagemId: string, atividadeId: number, dto: AtualizarAtividadeViagemDto) {
    await this.garantirAtividadeDaViagem(viagemId, atividadeId);

    if (dto.destinoViagemId) {
      await this.garantirDestinoDaViagem(viagemId, dto.destinoViagemId);
    }

    const atividade = await this.prisma.atividadeViagem.update({
      where: { id: atividadeId },
      data: {
        destinoViagemId: dto.destinoViagemId,
        dataHorario: dto.dataHorario ? new Date(dto.dataHorario) : undefined,
        duracaoMin: dto.duracaoMin,
        custoPrevisto: dto.custoPrevisto,
        status: dto.status,
      },
      include: { catalogoAtividade: true },
    });

    await this.orcamentoService.recalcularPrevisto(viagemId);

    return atividade;
  }

  async removerDaViagem(viagemId: string, atividadeId: number) {
    await this.garantirAtividadeDaViagem(viagemId, atividadeId);
    await this.prisma.atividadeViagem.delete({ where: { id: atividadeId } });
    await this.orcamentoService.recalcularPrevisto(viagemId);
  }

  private async garantirDestinoDaViagem(viagemId: string, destinoViagemId: number) {
    const destino = await this.prisma.destinoViagem.findUnique({
      where: { id: destinoViagemId },
      select: { viagemId: true },
    });

    if (!destino || destino.viagemId !== viagemId) {
      throw new BadRequestException('O destino informado nao pertence a esta viagem');
    }
  }

  private async garantirAtividadeDaViagem(viagemId: string, atividadeId: number) {
    const atividade = await this.prisma.atividadeViagem.findUnique({
      where: { id: atividadeId },
      select: { destinoViagem: { select: { viagemId: true } } },
    });

    if (!atividade || atividade.destinoViagem.viagemId !== viagemId) {
      throw new NotFoundException('Atividade nao encontrada nesta viagem');
    }
  }
}
