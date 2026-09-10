import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';

/** Campos publicos do usuario: o hash de senha nunca sai do backend (RNF03). */
const SELECAO_PUBLICA = { id: true, nome: true, email: true, criadoEm: true } as const;

@Injectable()
export class UsuariosService {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorId(id: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECAO_PUBLICA,
    });

    if (!usuario) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return usuario;
  }

  atualizarPerfil(id: number, dto: AtualizarPerfilDto) {
    return this.prisma.usuario.update({
      where: { id },
      data: { nome: dto.nome?.trim() },
      select: SELECAO_PUBLICA,
    });
  }
}
