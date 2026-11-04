import { ApiProperty } from '@nestjs/swagger';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';

/** Aviso in-app de uma alteracao relevante na viagem. */
export class NotificacaoDto {
  @ApiProperty({
    example: 1,
    description: 'Id da notificacao: e o {notificacaoId} ao marcar como lida',
  })
  id!: number;

  @ApiProperty({ example: 'DEMO2027', description: 'Codigo da viagem em que ocorreu a alteracao' })
  viagemId!: string;

  @ApiProperty({ example: 'ATIVIDADE_ADICIONADA', description: 'O que mudou na viagem' })
  tipo!: string;

  @ApiProperty({ example: 'Ana Souza adicionou Torre de Belem ao roteiro de Lisboa' })
  mensagem!: string;

  @ApiProperty({ example: false })
  lida!: boolean;

  @ApiProperty({ example: '2026-09-22T09:15:00.000Z' })
  criadaEm!: Date;
}

export class PaginaNotificacoesDto extends PaginaBaseDto {
  @ApiProperty({ type: [NotificacaoDto] })
  itens!: NotificacaoDto[];
}
