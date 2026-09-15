import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AdicionarDestinoViagemDto } from './dto/adicionar-destino-viagem.dto';
import { AtualizarDestinoViagemDto } from './dto/atualizar-destino-viagem.dto';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';
import { CriarDestinoCatalogoDto } from './dto/criar-destino-catalogo.dto';

@Injectable()
export class DestinosService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------- Catalogo global ----------------------

  /** RF10, RN01 - catalogo publico, pesquisavel tambem por visitantes. */
  async buscarNoCatalogo(filtros: BuscarDestinosDto) {
    const where: Prisma.DestinoCatalogoWhereInput = {
      ...(filtros.busca && { nome: { contains: filtros.busca, mode: 'insensitive' } }),
      ...(filtros.categoria && { categoria: filtros.categoria }),
      ...(filtros.pais && { pais: { equals: filtros.pais, mode: 'insensitive' } }),
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.destinoCatalogo.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: filtros.pular,
        take: filtros.limite,
      }),
      this.prisma.destinoCatalogo.count({ where }),
    ]);

    return new RespostaPaginada(itens, total, filtros);
  }

  async buscarDoCatalogoPorId(id: number) {
    const destino = await this.prisma.destinoCatalogo.findUnique({ where: { id } });

    if (!destino) {
      throw new NotFoundException('Destino nao encontrado no catalogo');
    }

    return destino;
  }

  criarNoCatalogo(dto: CriarDestinoCatalogoDto) {
    return this.prisma.destinoCatalogo.create({ data: dto });
  }

  // -------------------- Destinos de uma viagem -------------------

  /** RF08 - lista os destinos da viagem na ordem de visita. */
  listarDaViagem(viagemId: string) {
    return this.prisma.destinoViagem.findMany({
      where: { viagemId },
      include: {
        destinoCatalogo: true,
        _count: { select: { atividades: true } },
      },
      orderBy: [{ ordem: 'asc' }, { chegada: 'asc' }],
    });
  }

  /** RF08 - adiciona um destino a viagem. Sem `ordem`, entra no fim do roteiro. */
  async adicionarNaViagem(viagemId: string, dto: AdicionarDestinoViagemDto) {
    const ordem = dto.ordem ?? (await this.proximaOrdem(viagemId));

    return this.prisma.destinoViagem.create({
      data: {
        viagemId,
        destinoCatalogoId: dto.destinoCatalogoId,
        chegada: dto.chegada ? new Date(dto.chegada) : null,
        saida: dto.saida ? new Date(dto.saida) : null,
        descricao: dto.descricao,
        ordem,
      },
      include: { destinoCatalogo: true },
    });
  }

  async atualizarNaViagem(viagemId: string, destinoId: number, dto: AtualizarDestinoViagemDto) {
    await this.garantirDestinoDaViagem(viagemId, destinoId);

    return this.prisma.destinoViagem.update({
      where: { id: destinoId },
      data: {
        chegada: dto.chegada ? new Date(dto.chegada) : undefined,
        saida: dto.saida ? new Date(dto.saida) : undefined,
        descricao: dto.descricao,
        ordem: dto.ordem,
      },
      include: { destinoCatalogo: true },
    });
  }

  async removerDaViagem(viagemId: string, destinoId: number) {
    await this.garantirDestinoDaViagem(viagemId, destinoId);
    await this.prisma.destinoViagem.delete({ where: { id: destinoId } });
  }

  private async proximaOrdem(viagemId: string): Promise<number> {
    const ultimo = await this.prisma.destinoViagem.findFirst({
      where: { viagemId },
      orderBy: { ordem: 'desc' },
      select: { ordem: true },
    });

    return (ultimo?.ordem ?? -1) + 1;
  }

  /** Garante que o destino pertence a viagem cujo acesso ja foi validado (RN06). */
  private async garantirDestinoDaViagem(viagemId: string, destinoId: number) {
    const destino = await this.prisma.destinoViagem.findUnique({
      where: { id: destinoId },
      select: { viagemId: true },
    });

    if (!destino || destino.viagemId !== viagemId) {
      throw new NotFoundException('Destino nao encontrado nesta viagem');
    }
  }
}
