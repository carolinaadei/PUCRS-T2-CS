import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, StatusViagem } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PaginacaoDto, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AtualizarViagemDto } from './dto/atualizar-viagem.dto';
import { CriarViagemDto } from './dto/criar-viagem.dto';

/** Alfabeto sem caracteres ambiguos (0/O, 1/I) para o codigo ser ditado sem erro. */
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 8;
const MAX_TENTATIVAS_CODIGO = 5;

@Injectable()
export class ViagensService {
  constructor(private readonly prisma: PrismaService) {}

  /** RF04 - cria a viagem gerando o codigo de convite usado no RF18. */
  async criar(usuarioId: number, dto: CriarViagemDto) {
    // Colisao de codigo e improvavel, mas nao impossivel: tentamos novamente.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CODIGO; tentativa++) {
      try {
        return await this.prisma.viagem.create({
          data: {
            id: this.gerarCodigoConvite(),
            nome: dto.nome.trim(),
            descricao: dto.descricao,
            dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : null,
            dataFim: dto.dataFim ? new Date(dto.dataFim) : null,
            status: dto.status ?? StatusViagem.EM_PLANEJAMENTO,
            criadoPor: usuarioId,
          },
        });
      } catch (erro) {
        const ehColisaoDeCodigo =
          erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';

        if (!ehColisaoDeCodigo) {
          throw erro;
        }
      }
    }

    throw new InternalServerErrorException('Nao foi possivel gerar um codigo de convite unico');
  }

  /**
   * RF06 - painel pessoal: viagens criadas pelo usuario e aquelas em que
   * ele foi convidado como colaborador (RN06).
   */
  async listarDoUsuario(usuarioId: number, paginacao: PaginacaoDto) {
    const filtro: Prisma.ViagemWhereInput = {
      OR: [{ criadoPor: usuarioId }, { membros: { some: { usuarioId } } }],
    };

    const [itens, total] = await this.prisma.$transaction([
      this.prisma.viagem.findMany({
        where: filtro,
        orderBy: [{ dataInicio: 'asc' }, { criadoEm: 'desc' }],
        skip: paginacao.pular,
        take: paginacao.limite,
        include: {
          _count: { select: { membros: true, destinos: true } },
        },
      }),
      this.prisma.viagem.count({ where: filtro }),
    ]);

    return new RespostaPaginada(itens, total, paginacao);
  }

  /** Detalhe da viagem. O acesso ja foi validado pelo AcessoViagemGuard (RN06). */
  async buscarPorId(viagemId: string) {
    const viagem = await this.prisma.viagem.findUnique({
      where: { id: viagemId },
      include: {
        criador: { select: { id: true, nome: true, email: true } },
        membros: {
          include: { usuario: { select: { id: true, nome: true, email: true } } },
          orderBy: { entrouEm: 'asc' },
        },
        destinos: {
          include: { destinoCatalogo: true },
          orderBy: { ordem: 'asc' },
        },
        orcamento: true,
      },
    });

    if (!viagem) {
      throw new NotFoundException(`Viagem ${viagemId} nao encontrada`);
    }

    return viagem;
  }

  /** RF05, RF07 - editar dados e status da viagem (exige EDITOR, RN02). */
  atualizar(viagemId: string, dto: AtualizarViagemDto) {
    return this.prisma.viagem.update({
      where: { id: viagemId },
      data: {
        nome: dto.nome?.trim(),
        descricao: dto.descricao,
        dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : undefined,
        dataFim: dto.dataFim ? new Date(dto.dataFim) : undefined,
        status: dto.status,
      },
    });
  }

  /** RF05 - excluir viagem (exige CRIADOR). Destinos, membros e orcamento caem em cascata. */
  async remover(viagemId: string) {
    await this.prisma.viagem.delete({ where: { id: viagemId } });
  }

  private gerarCodigoConvite(): string {
    let codigo = '';

    for (let i = 0; i < TAMANHO_CODIGO; i++) {
      codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
    }

    return codigo;
  }
}
