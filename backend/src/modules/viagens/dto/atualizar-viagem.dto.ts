import { PartialType } from '@nestjs/swagger';
import { CriarViagemDto } from './criar-viagem.dto';

/** RF05, RF07 - edicao da viagem, inclusive mudanca de status. */
export class AtualizarViagemDto extends PartialType(CriarViagemDto) {}
