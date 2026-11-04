import { Injectable, NotFoundException } from '@nestjs/common';
import { StatusViagem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverPaisIso } from './codigo-pais';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { PaisVisitadoDto } from './dto/perfil.dto';

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

  /**
   * RF11 - lista os paises que o usuario ja visitou (viagens CONCLUIDAS em que
   * e criador ou colaborador), convertidos para ISO 3166-1 alfa-2 (jsVectormap).
   */
  async listarPaisesVisitados(usuarioId: number): Promise<PaisVisitadoDto[]> {
    const viagensConcluidas = await this.prisma.viagem.findMany({
      where: {
        status: StatusViagem.CONCLUIDA,
        OR: [{ criadoPor: usuarioId }, { membros: { some: { usuarioId } } }],
      },
      select: {
        id: true,
        destinos: {
          select: {
            destinoCatalogo: {
              select: { pais: true },
            },
          },
        },
      },
    });

    const contagemPorCodigo = new Map<string, PaisVisitadoDto>();

    for (const viagem of viagensConcluidas) {
      const codigosNaViagem = new Set<string>();

      for (const destino of viagem.destinos) {
        const resolvido = resolverPaisIso(destino.destinoCatalogo.pais);
        if (!resolvido || codigosNaViagem.has(resolvido.codigo)) {
          continue;
        }

        codigosNaViagem.add(resolvido.codigo);

        const existente = contagemPorCodigo.get(resolvido.codigo);
        if (existente) {
          existente.viagens += 1;
        } else {
          contagemPorCodigo.set(resolvido.codigo, {
            codigo: resolvido.codigo,
            nome: resolvido.nome,
            viagens: 1,
          });
        }
      }
    }

    return Array.from(contagemPorCodigo.values()).sort(
      (a, b) => b.viagens - a.viagens || a.nome.localeCompare(b.nome),
    );
  }
}
