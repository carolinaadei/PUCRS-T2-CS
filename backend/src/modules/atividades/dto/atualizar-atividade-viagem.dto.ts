import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { AdicionarAtividadeViagemDto } from './adicionar-atividade-viagem.dto';

/**
 * Edicao de uma atividade agendada: envie so o que muda; `null` apaga horario,
 * duracao ou custo. A atividade do catalogo nao muda - para trocar, remova e
 * adicione outra.
 */
export class AtualizarAtividadeViagemDto extends OmitType(AdicionarAtividadeViagemDto, [
  'catalogoAtividadeId',
  'destinoViagemId',
] as const) {
  @ApiPropertyOptional({ example: 2, description: 'Move a atividade para outro destino da viagem' })
  @OpcionalNaoNulo()
  @IsInt({ message: 'O destinoViagemId deve ser um numero inteiro' })
  @Min(1, { message: 'O destinoViagemId deve ser maior que zero' })
  destinoViagemId?: number;
}
