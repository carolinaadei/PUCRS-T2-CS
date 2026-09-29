import { SetMetadata } from '@nestjs/common';

export const CHAVE_ROTA_PUBLICA = 'rotaPublica';

/**
 * Libera a rota para visitantes nao autenticados (RN01).
 * O JwtAuthGuard e global, entao rotas publicas precisam ser marcadas explicitamente.
 */
export const Publico = () => SetMetadata(CHAVE_ROTA_PUBLICA, true);
