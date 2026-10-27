import { ApiProperty, PickType } from '@nestjs/swagger';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

/** Autor da avaliacao, sem e-mail: as avaliacoes sao publicas (RN01). */
export class AutorAvaliacaoDto extends PickType(UsuarioResumoDto, ['id', 'nome'] as const) {}

/** RF22, RF23 - avaliacao de uma atividade do catalogo. */
export class AvaliacaoDto {
  @ApiProperty({ example: 7, description: 'Usado em DELETE /avaliacoes/{avaliacaoId}' })
  id!: number;

  @ApiProperty({ example: 1 })
  usuarioId!: number;

  @ApiProperty({ example: 1 })
  catalogoAtividadeId!: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  nota!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Vale a pena chegar cedo para evitar a fila.',
  })
  comentario!: string | null;

  @ApiProperty({ example: '2026-09-20T18:30:00.000Z' })
  criadoEm!: Date;

  @ApiProperty({ type: AutorAvaliacaoDto })
  usuario!: AutorAvaliacaoDto;
}
