import { SetMetadata } from '@nestjs/common';

export const CHAVE_NIVEL_ACESSO = 'nivelAcessoViagem';

/**
 * Niveis de acesso a uma viagem, do menos ao mais restritivo.
 * Mapeiam as regras de negocio RN02, RN03, RN04 e RN06.
 */
export enum NivelAcessoViagem {
  /** RN06 - criador ou colaborador convidado (inclui VISUALIZADOR). */
  MEMBRO = 'MEMBRO',
  /** RN02 - criador ou colaborador com permissao EDITOR. */
  EDITOR = 'EDITOR',
  /** RN04 - somente o criador da viagem. */
  CRIADOR = 'CRIADOR',
}

/**
 * Exige um nivel minimo de acesso a viagem identificada pelo parametro
 * de rota `:viagemId`. Deve ser usado junto do AcessoViagemGuard.
 */
export const NivelAcesso = (nivel: NivelAcessoViagem) => SetMetadata(CHAVE_NIVEL_ACESSO, nivel);
