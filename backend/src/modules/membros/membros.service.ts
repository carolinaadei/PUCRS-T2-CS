import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PermissaoMembro } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MembrosService {
  constructor(private readonly prisma: PrismaService) {}

  /** RF18 - entrar em uma viagem usando o codigo de convite. */
  async entrar(viagemId: string, usuarioId: number) {
    const viagem = await this.prisma.viagem.findUnique({
      where: { id: viagemId },
      select: { id: true, criadoPor: true },
    });

    if (!viagem) {
      throw new NotFoundException('Codigo de convite invalido');
    }

    if (viagem.criadoPor === usuarioId) {
      throw new ConflictException('Voce e o criador desta viagem');
    }

    const jaEhMembro = await this.prisma.membroViagem.findUnique({
      where: { viagemId_usuarioId: { viagemId, usuarioId } },
      select: { id: true },
    });

    if (jaEhMembro) {
      throw new ConflictException('Voce ja participa desta viagem');
    }

    // Quem entra pelo codigo comeca como VISUALIZADOR (RN03);
    // o criador promove a EDITOR quando quiser (RF20, RN04).
    return this.prisma.membroViagem.create({
      data: { viagemId, usuarioId, permissao: PermissaoMembro.VISUALIZADOR },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });
  }

  /** Lista colaboradores da viagem (visivel a qualquer membro). */
  listar(viagemId: string) {
    return this.prisma.membroViagem.findMany({
      where: { viagemId },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
      orderBy: { entrouEm: 'asc' },
    });
  }

  /** RF20, RN04 - o criador altera a permissao de um colaborador. */
  async definirPermissao(viagemId: string, membroId: number, permissao: PermissaoMembro) {
    await this.garantirMembroDaViagem(viagemId, membroId);

    return this.prisma.membroViagem.update({
      where: { id: membroId },
      data: { permissao },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });
  }

  /** RF20, RN04 - o criador remove um colaborador. */
  async remover(viagemId: string, membroId: number) {
    await this.garantirMembroDaViagem(viagemId, membroId);
    await this.prisma.membroViagem.delete({ where: { id: membroId } });
  }

  /** Um colaborador pode sair da viagem por conta propria. */
  async sair(viagemId: string, usuarioId: number) {
    const vinculo = await this.prisma.membroViagem.findUnique({
      where: { viagemId_usuarioId: { viagemId, usuarioId } },
      select: { id: true },
    });

    if (!vinculo) {
      throw new BadRequestException('O criador da viagem nao pode sair dela; exclua a viagem');
    }

    await this.prisma.membroViagem.delete({ where: { id: vinculo.id } });
  }

  /** Impede manipular um vinculo que pertence a outra viagem. */
  private async garantirMembroDaViagem(viagemId: string, membroId: number) {
    const vinculo = await this.prisma.membroViagem.findUnique({
      where: { id: membroId },
      select: { viagemId: true },
    });

    if (!vinculo || vinculo.viagemId !== viagemId) {
      throw new NotFoundException('Colaborador nao encontrado nesta viagem');
    }
  }
}
