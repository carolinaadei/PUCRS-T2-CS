import { Injectable } from '@nestjs/common';
import { StatusViagem } from '@prisma/client';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { naoEncontrado } from '../../common/erros/erros';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { resolverPaisIso } from './codigo-pais';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { PaisVisitadoDto, PerfilDto } from './dto/perfil.dto';

/** Campos publicos do usuario: o hash de senha nunca sai do backend. */
const SELECAO_PUBLICA = { id: true, nome: true, email: true, criadoEm: true } as const;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async buscarPorId(id: number): Promise<PerfilDto> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id },
      select: SELECAO_PUBLICA,
    });

    if (!usuario) {
      throw naoEncontrado(CodigoErro.USUARIO_NAO_ENCONTRADO, 'Usuario nao encontrado');
    }

    return usuario;
  }

  atualizarPerfil(id: number, dto: AtualizarPerfilDto): Promise<PerfilDto> {
    return this.prisma.usuario.update({
      where: { id },
      data: { nome: dto.nome },
      select: SELECAO_PUBLICA,
    });
  }

  /**
   * Exclui a conta depois de conferir a senha. Vao junto as viagens criadas pela
   * pessoa (com tudo dentro), as participacoes, as avaliacoes e as sessoes; os
   * itens que ela cadastrou no catalogo ficam, sem autor.
   */
  async excluirConta(usuarioId: number, senha: string): Promise<void> {
    await this.authService.conferirSenha(usuarioId, senha);
    await this.prisma.usuario.delete({ where: { id: usuarioId } });
  }

  /**
   * Paises que o usuario ja visitou (viagens CONCLUIDAS em que e criador ou
   * colaborador), convertidos para ISO 3166-1 alfa-2 (o que o jsVectormap usa).
   */
  async listarPaisesVisitados(usuarioId: number): Promise<PaisVisitadoDto[]> {
    const viagensConcluidas = await this.prisma.viagem.findMany({
      where: {
        status: StatusViagem.CONCLUIDA,
        OR: [{ criadoPor: usuarioId }, { membros: { some: { usuarioId } } }],
      },
      select: { destinos: { select: { destinoCatalogo: { select: { pais: true } } } } },
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
          contagemPorCodigo.set(resolvido.codigo, { ...resolvido, viagens: 1 });
        }
      }
    }

    return Array.from(contagemPorCodigo.values()).sort(
      (a, b) => b.viagens - a.viagens || a.nome.localeCompare(b.nome),
    );
  }
}
