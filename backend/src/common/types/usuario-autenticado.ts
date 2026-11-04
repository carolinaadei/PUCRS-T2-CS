import { PermissaoMembro } from '@prisma/client';

/** Payload assinado no JWT de acesso. */
export interface PayloadJwt {
  /** subject: id do usuario */
  sub: number;
  email: string;
  /** versao de sessao do usuario na emissao; se mudou depois, o token foi revogado */
  ver: number;
}

/** Usuario resolvido pela JwtStrategy e anexado a requisicao. */
export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
}

/** Papel de quem fez a requisicao na viagem: o criador ou o nivel do colaborador. */
export type PapelNaViagem = 'CRIADOR' | PermissaoMembro;

/** O que o AcessoViagemGuard descobriu sobre a viagem, guardado em `req.viagemContexto`. */
export interface ContextoViagem {
  viagemId: string;
  papel: PapelNaViagem;
}
