import { OmitType, PartialType } from '@nestjs/swagger';
import { AdicionarDestinoViagemDto } from './adicionar-destino-viagem.dto';

/** O destino do catalogo nao muda: para trocar, remova e adicione outro. */
export class AtualizarDestinoViagemDto extends PartialType(
  OmitType(AdicionarDestinoViagemDto, ['destinoCatalogoId'] as const),
) {}
