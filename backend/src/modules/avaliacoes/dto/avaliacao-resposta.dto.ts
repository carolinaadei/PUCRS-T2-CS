import { ApiProperty, PickType } from '@nestjs/swagger';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

/**
 * Autor da avaliacao contendo apenas dados publicos (id e nome),
 * sem expor informacoes sensiveis como e-mail e hash de senha (RN01, RNF03).
 */
export class AutorAvaliacaoDto extends PickType(UsuarioResumoDto, ['id', 'nome'] as const) {}

/**
 * RF22, RF23 - DTO de resposta para avaliacao de uma atividade do catalogo,
 * contendo nota, comentario opcional, data de criacao e dados do autor.
 */
export class AvaliacaoDto {
  /** Identificador unico da avaliacao (usado no endpoint DELETE /avaliacoes/:avaliacaoId). */
  @ApiProperty({ example: 7, description: 'Id da avaliacao' })
  id!: number;

  /** Identificador do usuario autor da avaliacao. */
  @ApiProperty({ example: 1, description: 'Id do usuario autor' })
  usuarioId!: number;

  /** Identificador da atividade avaliada no catalogo. */
  @ApiProperty({ example: 1, description: 'Id da atividade no catalogo' })
  catalogoAtividadeId!: number;

  /** Nota atribuida a atividade de 1 a 5 estrelas. */
  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Nota de 1 a 5 estrelas' })
  nota!: number;

  /** Comentario em texto deixado pelo autor, ou null caso nao informado. */
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Vale a pena chegar cedo para evitar a fila.',
    description: 'Comentario opcional do usuario',
  })
  comentario!: string | null;

  /** Data e horario em que a avaliacao foi registrada. */
  @ApiProperty({ example: '2026-09-20T18:30:00.000Z', description: 'Data de criacao da avaliacao' })
  criadoEm!: Date;

  /** Dados resumidos do usuario autor da avaliacao. */
  @ApiProperty({ type: AutorAvaliacaoDto, description: 'Dados publicos do autor' })
  usuario!: AutorAvaliacaoDto;
}
