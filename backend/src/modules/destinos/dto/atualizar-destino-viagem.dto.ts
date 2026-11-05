import { OmitType } from '@nestjs/swagger';
import { AdicionarDestinoViagemDto } from './adicionar-destino-viagem.dto';

/**
 * Datas, descricao e posicao no roteiro. Envie so o que muda; `null` apaga
 * chegada, saida ou descricao. Para trocar a cidade, remova e adicione outro.
 */
export class AtualizarDestinoViagemDto extends OmitType(AdicionarDestinoViagemDto, [
  'destinoCatalogoId',
] as const) {}
