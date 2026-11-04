import { Viagem } from '@prisma/client';
import { PapelNaViagem } from '../../common/types/usuario-autenticado';
import { paraDia } from '../../common/utils/formatos';
import { ViagemDto } from './dto/viagem-resposta.dto';

/**
 * As datas gerais saem como aaaa-mm-dd, o mesmo formato em que chegam: o
 * instante (2027-01-10T00:00:00Z) faria um front no fuso do Brasil exibir 09/01.
 * O codigo de convite so vai para o criador.
 */
export const paraViagemDto = (viagem: Viagem, papel: PapelNaViagem): ViagemDto => ({
  id: viagem.id,
  nome: viagem.nome,
  descricao: viagem.descricao,
  dataInicio: paraDia(viagem.dataInicio),
  dataFim: paraDia(viagem.dataFim),
  status: viagem.status,
  criadoPor: viagem.criadoPor,
  criadoEm: viagem.criadoEm,
  minhaPermissao: papel,
  codigoConvite: papel === 'CRIADOR' ? viagem.codigoConvite : null,
});
