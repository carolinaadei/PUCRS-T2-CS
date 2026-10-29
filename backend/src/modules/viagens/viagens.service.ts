import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatusViagem, Viagem } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PaginacaoDto, RespostaPaginada } from '../../common/dto/paginacao.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AtualizarViagemDto } from './dto/atualizar-viagem.dto';
import { CriarViagemDto } from './dto/criar-viagem.dto';

/** Alfabeto sem caracteres ambiguos (0/O, 1/I) para o codigo ser ditado sem erro. */
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TAMANHO_CODIGO = 8;
const MAX_TENTATIVAS_CODIGO = 5;

/** Dia (aaaa-mm-dd) de uma data da coluna DATE, que o Prisma entrega a meia-noite UTC. */
const paraDia = (data: Date) => data.toISOString().slice(0, 10);

@Injectable()
export class ViagensService {
  constructor(private readonly prisma: PrismaService) {}

  /** RF04 - cria a viagem gerando o codigo de convite usado no RF18. */
  async criar(usuarioId: number, dto: CriarViagemDto) {
    const dataInicio = this.paraData(dto.dataInicio, 'inicio');
    const dataFim = this.paraData(dto.dataFim, 'fim');

    this.validarPeriodo(dataInicio, dataFim);

    // Colisao de codigo e improvavel, mas nao impossivel: tentamos novamente.
    for (let tentativa = 0; tentativa < MAX_TENTATIVAS_CODIGO; tentativa++) {
      try {
        const viagem = await this.prisma.viagem.create({
          data: {
            id: this.gerarCodigoConvite(),
            nome: dto.nome,
            descricao: dto.descricao,
            dataInicio,
            dataFim,
            status: dto.status ?? StatusViagem.EM_PLANEJAMENTO,
            criadoPor: usuarioId,
          },
        });

        return this.comDatasDoDia(viagem);
      } catch (erro) {
        const ehColisaoDeCodigo =
          erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';

        if (!ehColisaoDeCodigo) {
          throw erro;
        }
      }
    }

    throw new InternalServerErrorException(
      'Nao foi possivel criar a viagem agora. Tente novamente',
    );
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

    return new RespostaPaginada(
      itens.map((viagem) => this.comDatasDoDia(viagem)),
      total,
      paginacao,
    );
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

    return this.comDatasDoDia(viagem);
  }

  /**
   * RF05, RF07 - editar dados e status da viagem (exige EDITOR, RN02). Campo
   * omitido fica como esta; `null` apaga a descricao ou uma das datas.
   */
  async atualizar(viagemId: string, dto: AtualizarViagemDto) {
    // O periodo e conferido junto com o que ja esta gravado: mudar so uma das
    // datas tambem nao pode deixar o fim antes do inicio.
    const atual = await this.prisma.viagem.findUniqueOrThrow({
      where: { id: viagemId },
      select: { dataInicio: true, dataFim: true },
    });

    const dataInicio =
      dto.dataInicio === undefined ? atual.dataInicio : this.paraData(dto.dataInicio, 'inicio');
    const dataFim = dto.dataFim === undefined ? atual.dataFim : this.paraData(dto.dataFim, 'fim');

    this.validarPeriodo(dataInicio, dataFim);

    const viagem = await this.prisma.viagem.update({
      where: { id: viagemId },
      data: {
        // Nome e status sao obrigatorios: null vale como campo omitido.
        nome: dto.nome ?? undefined,
        descricao: dto.descricao,
        dataInicio,
        dataFim,
        status: dto.status ?? undefined,
      },
    });

    return this.comDatasDoDia(viagem);
  }

  /** RF05 - excluir viagem (exige CRIADOR). Destinos, membros e orcamento caem em cascata. */
  async remover(viagemId: string) {
    await this.prisma.viagem.delete({ where: { id: viagemId } });
  }

  /**
   * Converte a data recebida (aaaa-mm-dd) para UTC, de modo que o dia gravado
   * na coluna DATE seja sempre o informado, independentemente do fuso do servidor.
   */
  private paraData(valor: string | null | undefined, campo: 'inicio' | 'fim'): Date | null {
    if (!valor) {
      return null;
    }

    const data = new Date(`${valor}T00:00:00.000Z`);

    // Descarta dias inexistentes (ex.: 2027-02-31), que o Date normalizaria em silencio.
    if (Number.isNaN(data.getTime()) || paraDia(data) !== valor) {
      throw new BadRequestException(`A data de ${campo} ${valor} nao existe no calendario`);
    }

    return data;
  }

  /**
   * Devolve as datas gerais como aaaa-mm-dd, o mesmo formato em que chegam. O
   * instante (2027-01-10T00:00:00.000Z) faria um front no fuso do Brasil exibir 09/01.
   */
  private comDatasDoDia<T extends Pick<Viagem, 'dataInicio' | 'dataFim'>>(viagem: T) {
    return {
      ...viagem,
      dataInicio: viagem.dataInicio && paraDia(viagem.dataInicio),
      dataFim: viagem.dataFim && paraDia(viagem.dataFim),
    };
  }

  /** RF04, RF05 - as datas gerais formam um periodo: precisam de inicio e nao podem inverter. */
  private validarPeriodo(dataInicio: Date | null, dataFim: Date | null) {
    if (dataFim && !dataInicio) {
      throw new BadRequestException('Uma viagem com data de fim precisa ter data de inicio');
    }

    if (dataInicio && dataFim && dataFim < dataInicio) {
      throw new BadRequestException('A data de fim nao pode ser anterior a data de inicio');
    }
  }

  private gerarCodigoConvite(): string {
    let codigo = '';

    for (let i = 0; i < TAMANHO_CODIGO; i++) {
      codigo += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)];
    }

    return codigo;
  }
}
