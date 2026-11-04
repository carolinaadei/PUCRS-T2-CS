import { Injectable } from '@nestjs/common';
import { Prisma, StatusViagem, TipoNotificacao } from '@prisma/client';
import { RespostaPaginada } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { requisicaoInvalida } from '../../common/erros/erros';
import { PapelNaViagem, UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { gerarCodigo } from '../../common/utils/codigo';
import { deDia } from '../../common/utils/formatos';
import { PrismaService } from '../../prisma/prisma.service';
import { travarViagem } from '../../prisma/travas';
import { paraDestinoViagemDto } from '../destinos/destinos.mapper';
import { INCLUIR_USUARIO, paraMembroDto } from '../membros/membros.mapper';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { paraOrcamentoDto } from '../orcamento/orcamento.service';
import { BuscarViagensDto } from './dto/buscar-viagens.dto';
import { AtualizarViagemDto, CriarViagemDto } from './dto/criar-viagem.dto';
import { ViagemDetalheDto, ViagemDto, ViagemResumoDto } from './dto/viagem-resposta.dto';
import { paraViagemDto } from './viagens.mapper';

/** Colisao de codigo e improvavel, mas nao impossivel: tenta outros antes de desistir. */
const TENTATIVAS_DE_CODIGO = 5;

/** Converte o que veio no corpo: omitido mantem, null apaga, string vira data. */
const dataDoCorpo = (valor: string | null | undefined, atual: Date | null, campo: string) =>
  valor === undefined ? atual : valor === null ? null : deDia(valor, campo);

@Injectable()
export class ViagensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Cria a viagem com id e codigo de convite aleatorios e independentes. */
  async criar(usuarioId: number, dto: CriarViagemDto): Promise<ViagemDto> {
    const dataInicio = dataDoCorpo(dto.dataInicio, null, 'inicio');
    const dataFim = dataDoCorpo(dto.dataFim, null, 'fim');
    this.validarPeriodo(dataInicio, dataFim);

    for (let tentativa = 1; ; tentativa++) {
      try {
        const viagem = await this.prisma.viagem.create({
          data: {
            id: gerarCodigo(),
            codigoConvite: gerarCodigo(),
            nome: dto.nome,
            descricao: dto.descricao ?? null,
            dataInicio,
            dataFim,
            status: dto.status ?? StatusViagem.EM_PLANEJAMENTO,
            criadoPor: usuarioId,
          },
        });

        return paraViagemDto(viagem, 'CRIADOR');
      } catch (erro) {
        const colidiu =
          erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';

        if (!colidiu || tentativa >= TENTATIVAS_DE_CODIGO) {
          throw erro;
        }
      }
    }
  }

  /** Painel pessoal: viagens criadas pelo usuario e aquelas em que colabora. */
  async listarDoUsuario(usuarioId: number, filtro: BuscarViagensDto) {
    const where: Prisma.ViagemWhereInput = {
      OR: [{ criadoPor: usuarioId }, { membros: { some: { usuarioId } } }],
      ...(filtro.status && { status: filtro.status }),
    };

    const [viagens, total] = await this.prisma.$transaction([
      this.prisma.viagem.findMany({
        where,
        orderBy: [{ dataInicio: { sort: 'asc', nulls: 'last' } }, { criadoEm: 'desc' }],
        skip: filtro.pular,
        take: filtro.limite,
        include: {
          membros: { where: { usuarioId }, select: { permissao: true } },
          _count: { select: { membros: true, destinos: true } },
        },
      }),
      this.prisma.viagem.count({ where }),
    ]);

    const itens = viagens.map((viagem): ViagemResumoDto => ({
      ...paraViagemDto(
        viagem,
        viagem.criadoPor === usuarioId ? 'CRIADOR' : viagem.membros[0].permissao,
      ),
      totais: { colaboradores: viagem._count.membros, destinos: viagem._count.destinos },
    }));

    return new RespostaPaginada(itens, total, filtro);
  }

  /** Viagem completa. O acesso ja foi validado pelo AcessoViagemGuard. */
  async buscarDetalhe(viagemId: string, papel: PapelNaViagem): Promise<ViagemDetalheDto> {
    const viagem = await this.prisma.viagem.findUniqueOrThrow({
      where: { id: viagemId },
      include: {
        criador: { select: { id: true, nome: true, email: true } },
        membros: { include: INCLUIR_USUARIO, orderBy: [{ entrouEm: 'asc' }, { id: 'asc' }] },
        destinos: {
          include: { destinoCatalogo: true },
          orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
        },
        orcamento: true,
      },
    });

    return {
      ...paraViagemDto(viagem, papel),
      criador: viagem.criador,
      membros: viagem.membros.map(paraMembroDto),
      destinos: viagem.destinos.map(paraDestinoViagemDto),
      orcamento: viagem.orcamento && paraOrcamentoDto(viagem.orcamento),
    };
  }

  /**
   * Edita dados e status. Campo omitido fica como esta; `null` apaga a
   * descricao ou uma das datas. O novo periodo nao pode deixar destinos de fora.
   */
  async atualizar(
    viagemId: string,
    autor: UsuarioAutenticado,
    papel: PapelNaViagem,
    dto: AtualizarViagemDto,
  ): Promise<ViagemDto> {
    return this.prisma.$transaction(async (tx) => {
      // Trava junto com os destinos: nenhum destino entra fora do periodo
      // enquanto o periodo esta sendo trocado.
      await travarViagem(tx, viagemId);
      const atual = await tx.viagem.findUniqueOrThrow({
        where: { id: viagemId },
        select: { dataInicio: true, dataFim: true },
      });

      const dataInicio = dataDoCorpo(dto.dataInicio, atual.dataInicio, 'inicio');
      const dataFim = dataDoCorpo(dto.dataFim, atual.dataFim, 'fim');
      this.validarPeriodo(dataInicio, dataFim);
      await this.garantirDestinosNoPeriodo(tx, viagemId, dataInicio, dataFim);

      const viagem = await tx.viagem.update({
        where: { id: viagemId },
        data: {
          nome: dto.nome,
          ...(dto.descricao !== undefined && { descricao: dto.descricao }),
          dataInicio,
          dataFim,
          status: dto.status,
        },
      });

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.VIAGEM_ATUALIZADA,
        mensagem: (nomeViagem) => `${autor.nome} atualizou as informacoes de ${nomeViagem}`,
      });

      return paraViagemDto(viagem, papel);
    });
  }

  /** Exclui a viagem; destinos, atividades, membros, orcamento e avisos caem em cascata. */
  async remover(viagemId: string): Promise<void> {
    await this.prisma.viagem.delete({ where: { id: viagemId } });
  }

  /** As datas gerais formam um periodo: precisam de inicio e nao podem inverter. */
  private validarPeriodo(dataInicio: Date | null, dataFim: Date | null) {
    if (dataFim && !dataInicio) {
      throw requisicaoInvalida(
        CodigoErro.PERIODO_INVALIDO,
        'Uma viagem com data de fim precisa ter data de inicio',
      );
    }

    if (dataInicio && dataFim && dataFim < dataInicio) {
      throw requisicaoInvalida(
        CodigoErro.PERIODO_INVALIDO,
        'A data de fim nao pode ser anterior a data de inicio',
      );
    }
  }

  private async garantirDestinosNoPeriodo(
    tx: Prisma.TransactionClient,
    viagemId: string,
    dataInicio: Date | null,
    dataFim: Date | null,
  ) {
    const foraDoPeriodo: Prisma.DestinoViagemWhereInput[] = [
      ...(dataInicio ? [{ chegada: { lt: dataInicio } }, { saida: { lt: dataInicio } }] : []),
      ...(dataFim ? [{ chegada: { gt: dataFim } }, { saida: { gt: dataFim } }] : []),
    ];

    if (foraDoPeriodo.length === 0) {
      return;
    }

    const quantos = await tx.destinoViagem.count({ where: { viagemId, OR: foraDoPeriodo } });

    if (quantos > 0) {
      throw requisicaoInvalida(
        CodigoErro.DESTINOS_FORA_DO_PERIODO,
        `${quantos} destino(s) do roteiro ficariam fora do novo periodo; ajuste as datas deles antes`,
      );
    }
  }
}
