import { OmitType, PartialType } from '@nestjs/swagger';
import { AdicionarAtividadeViagemDto } from './adicionar-atividade-viagem.dto';

/**
 * RF13 - DTO para edicao parcial de uma atividade agendada na viagem.
 * Permite alterar destino da viagem, data/horario, duracao estimada, custo previsto e status,
 * mantendo imutavel a referencia `catalogoAtividadeId`.
 */
export class AtualizarAtividadeViagemDto extends PartialType(
  OmitType(AdicionarAtividadeViagemDto, ['catalogoAtividadeId'] as const),
) {}
