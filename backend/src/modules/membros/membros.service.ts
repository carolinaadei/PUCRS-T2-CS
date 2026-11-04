import { Injectable } from '@nestjs/common';
import { PermissaoMembro, Prisma, TipoNotificacao } from '@prisma/client';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { conflito, naoEncontrado, requisicaoInvalida } from '../../common/erros/erros';
import { ContextoViagem, UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { gerarCodigo, normalizarCodigo } from '../../common/utils/codigo';
import { paraDia } from '../../common/utils/formatos';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { CodigoConviteDto, ConviteDto } from './dto/convite.dto';
import { MembroDto } from './dto/membro-resposta.dto';
import { INCLUIR_USUARIO, paraMembroDto } from './membros.mapper';

/** Colisao de codigo e improvavel, mas nao impossivel: tenta outros antes de desistir. */
const TENTATIVAS_DE_CODIGO = 5;

type Tx = Prisma.TransactionClient;

@Injectable()
export class MembrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  // ------------------------------ Convite ------------------------------

  /** Mostra para quem recebeu o codigo qual viagem ele vai aceitar. */
  async verConvite(codigo: string): Promise<ConviteDto> {
    const viagem = await this.viagemDoConvite(this.prisma, codigo);

    return {
      viagemId: viagem.id,
      nome: viagem.nome,
      dataInicio: paraDia(viagem.dataInicio),
      dataFim: paraDia(viagem.dataFim),
      criador: viagem.criador,
      totalColaboradores: viagem._count.membros,
    };
  }

  /** Entra na viagem pelo codigo de convite. Quem entra comeca como VISUALIZADOR. */
  async aceitarConvite(codigo: string, usuario: UsuarioAutenticado): Promise<MembroDto> {
    const jaParticipa = conflito(CodigoErro.JA_PARTICIPA, 'Voce ja participa desta viagem');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const viagem = await this.viagemDoConvite(tx, codigo);

        if (viagem.criadoPor === usuario.id) {
          throw jaParticipa;
        }

        const membro = await tx.membroViagem.create({
          data: {
            viagemId: viagem.id,
            usuarioId: usuario.id,
            permissao: PermissaoMembro.VISUALIZADOR,
          },
          include: INCLUIR_USUARIO,
        });

        await this.notificacoes.registrar(tx, {
          viagemId: viagem.id,
          autorId: usuario.id,
          tipo: TipoNotificacao.MEMBRO_ENTROU,
          mensagem: (nomeViagem) => `${usuario.nome} entrou em ${nomeViagem}`,
        });

        return paraMembroDto(membro);
      });
    } catch (erro) {
      // Indice unico (viagem, usuario): ja era membro, ou dois aceites simultaneos.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        throw jaParticipa;
      }

      throw erro;
    }
  }

  /** Troca o codigo de convite: o anterior deixa de valer na hora. */
  async gerarNovoConvite(viagemId: string): Promise<CodigoConviteDto> {
    for (let tentativa = 1; ; tentativa++) {
      try {
        const viagem = await this.prisma.viagem.update({
          where: { id: viagemId },
          data: { codigoConvite: gerarCodigo() },
          select: { codigoConvite: true },
        });

        return { codigoConvite: viagem.codigoConvite };
      } catch (erro) {
        const colidiu =
          erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';

        if (!colidiu || tentativa >= TENTATIVAS_DE_CODIGO) {
          throw erro;
        }
      }
    }
  }

  // ----------------------------- Membros ------------------------------

  /** Colaboradores por ordem de entrada. O criador fica de fora (ver GET /viagens/{id}). */
  async listar(viagemId: string): Promise<MembroDto[]> {
    const membros = await this.prisma.membroViagem.findMany({
      where: { viagemId },
      include: INCLUIR_USUARIO,
      orderBy: [{ entrouEm: 'asc' }, { id: 'asc' }],
    });

    return membros.map(paraMembroDto);
  }

  async definirPermissao(
    viagemId: string,
    membroId: number,
    permissao: PermissaoMembro,
    autor: UsuarioAutenticado,
  ): Promise<MembroDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.membroDaViagem(tx, viagemId, membroId);

      const membro = await tx.membroViagem.update({
        where: { id: membroId },
        data: { permissao },
        include: INCLUIR_USUARIO,
      });

      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.PERMISSAO_ALTERADA,
        destinatarios: [membro.usuarioId],
        mensagem: (nomeViagem) =>
          `${autor.nome} mudou sua permissao em ${nomeViagem} para ${permissao}`,
      });

      return paraMembroDto(membro);
    });
  }

  async remover(viagemId: string, membroId: number, autor: UsuarioAutenticado): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const membro = await this.membroDaViagem(tx, viagemId, membroId);
      await tx.membroViagem.delete({ where: { id: membroId } });

      // Quem saiu ainda recebe o aviso, mesmo sem acesso a viagem.
      await this.notificacoes.registrar(tx, {
        viagemId,
        autorId: autor.id,
        tipo: TipoNotificacao.MEMBRO_REMOVIDO,
        destinatarios: [membro.usuarioId],
        mensagem: (nomeViagem) => `${autor.nome} removeu voce de ${nomeViagem}`,
      });
    });
  }

  /** O colaborador deixa a viagem. O criador nao sai: ele a exclui. */
  async sair(contexto: ContextoViagem, usuario: UsuarioAutenticado): Promise<void> {
    if (contexto.papel === 'CRIADOR') {
      throw requisicaoInvalida(
        CodigoErro.CRIADOR_NAO_SAI,
        'O criador nao pode sair da propria viagem; para encerra-la, exclua a viagem',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membroViagem.deleteMany({
        where: { viagemId: contexto.viagemId, usuarioId: usuario.id },
      });

      await this.notificacoes.registrar(tx, {
        viagemId: contexto.viagemId,
        autorId: usuario.id,
        tipo: TipoNotificacao.MEMBRO_SAIU,
        mensagem: (nomeViagem) => `${usuario.nome} saiu de ${nomeViagem}`,
      });
    });
  }

  // ------------------------------ Apoio ------------------------------

  private async viagemDoConvite(tx: Tx, codigo: string) {
    const viagem = await tx.viagem.findUnique({
      where: { codigoConvite: normalizarCodigo(codigo) },
      select: {
        id: true,
        nome: true,
        dataInicio: true,
        dataFim: true,
        criadoPor: true,
        criador: { select: { id: true, nome: true } },
        _count: { select: { membros: true } },
      },
    });

    if (!viagem) {
      throw naoEncontrado(
        CodigoErro.CONVITE_INVALIDO,
        'Codigo de convite invalido ou substituido por um novo',
      );
    }

    return viagem;
  }

  /** Impede manipular um vinculo que pertence a outra viagem. */
  private async membroDaViagem(tx: Tx, viagemId: string, membroId: number) {
    const membro = await tx.membroViagem.findUnique({
      where: { id: membroId },
      select: { viagemId: true, usuarioId: true },
    });

    if (!membro || membro.viagemId !== viagemId) {
      throw naoEncontrado(
        CodigoErro.MEMBRO_NAO_ENCONTRADO,
        'Colaborador nao encontrado nesta viagem',
      );
    }

    return membro;
  }
}
