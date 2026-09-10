import { OmitType, PartialType } from '@nestjs/swagger';
import { AdicionarAtividadeViagemDto } from './adicionar-atividade-viagem.dto';

export class AtualizarAtividadeViagemDto extends PartialType(
  OmitType(AdicionarAtividadeViagemDto, ['catalogoAtividadeId'] as const),
) {}
