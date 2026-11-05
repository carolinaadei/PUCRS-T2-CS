import { SetMetadata } from '@nestjs/common';

export const CHAVE_NIVEL_ACESSO = 'nivelAcessoViagem';

/**
 * Niveis de acesso a uma viagem, do menos ao mais restritivo.
 * MEMBRO < EDITOR < CRIADOR.
 */
export enum NivelAcessoViagem {
  /** Criador ou qualquer colaborador (inclui VISUALIZADOR). */
  MEMBRO = 'MEMBRO',
  /** Criador ou colaborador com permissao EDITOR. */
  EDITOR = 'EDITOR',
  /** Somente o criador da viagem. */
  CRIADOR = 'CRIADOR',
}

/**
 * Exige um nivel minimo de acesso a viagem identificada pelo parametro
 * de rota `:viagemId`. Deve ser usado junto do AcessoViagemGuard.
 */
export const NivelAcesso = (nivel: NivelAcessoViagem) => SetMetadata(CHAVE_NIVEL_ACESSO, nivel);
