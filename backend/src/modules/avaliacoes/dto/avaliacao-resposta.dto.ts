import { ApiProperty, PickType } from '@nestjs/swagger';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

/** Autor da avaliacao: so dados publicos, nunca o e-mail. */
export class AutorAvaliacaoDto extends PickType(UsuarioResumoDto, ['id', 'nome'] as const) {}

/** Avaliacao de uma atividade do catalogo. */
export class AvaliacaoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 1, description: 'Id da atividade no catalogo' })
  catalogoAtividadeId!: number;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5, description: 'Nota de 1 a 5 estrelas' })
  nota!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Vale a pena chegar cedo para evitar a fila.',
  })
  comentario!: string | null;

  @ApiProperty({ example: '2026-09-20T18:30:00.000Z' })
  criadoEm!: Date;

  @ApiProperty({ example: '2026-09-21T09:00:00.000Z', description: 'Ultima edicao da avaliacao' })
  atualizadoEm!: Date;

  @ApiProperty({ type: AutorAvaliacaoDto })
  autor!: AutorAvaliacaoDto;
}

export class PaginaAvaliacoesDto extends PaginaBaseDto {
  @ApiProperty({ type: [AvaliacaoDto] })
  itens!: AvaliacaoDto[];
}
