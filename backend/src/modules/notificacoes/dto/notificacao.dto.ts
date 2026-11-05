import { ApiProperty } from '@nestjs/swagger';
import { TipoNotificacao } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { PaginaBaseDto } from '../../../common/dto/paginacao.dto';

/** Aviso in-app de uma alteracao relevante numa viagem. */
export class NotificacaoDto {
  @ApiProperty({ example: 1, description: 'Id da notificacao: e o {notificacaoId}' })
  id!: number;

  @ApiProperty({ example: 'DEMO2027', description: 'Viagem em que ocorreu a alteracao' })
  viagemId!: string;

  @ApiProperty({
    enum: TipoNotificacao,
    enumName: 'TipoNotificacao',
    example: TipoNotificacao.ATIVIDADE_ADICIONADA,
  })
  tipo!: TipoNotificacao;

  @ApiProperty({ example: 'Ana Souza adicionou Torre de Belem a Eurotrip 2027' })
  mensagem!: string;

  @ApiProperty({ example: false })
  lida!: boolean;

  @ApiProperty({ type: Date, nullable: true, example: null })
  lidaEm!: Date | null;

  @ApiProperty({ example: '2026-09-22T09:15:00.000Z' })
  criadaEm!: Date;
}

export class PaginaNotificacoesDto extends PaginaBaseDto {
  @ApiProperty({ type: [NotificacaoDto] })
  itens!: NotificacaoDto[];
}

export class ContagemNotificacoesDto {
  @ApiProperty({ example: 3, description: 'Quantas notificacoes ainda nao foram lidas' })
  naoLidas!: number;
}

export class MarcacaoEmLoteDto {
  @ApiProperty({ example: 3, description: 'Quantas notificacoes foram marcadas agora' })
  atualizadas!: number;
}

export class MarcarNotificacaoDto {
  @ApiProperty({ example: true, description: 'true marca como lida; false volta a nao lida' })
  @IsBoolean({ message: 'O campo lida deve ser verdadeiro ou falso' })
  lida!: boolean;
}
