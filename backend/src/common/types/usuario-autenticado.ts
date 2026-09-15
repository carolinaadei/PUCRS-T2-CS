/** Payload assinado no JWT (RNF03). */
export interface PayloadJwt {
  /** subject: id do usuario */
  sub: number;
  email: string;
}

/** Usuario resolvido pela JwtStrategy e anexado a requisicao. */
export interface UsuarioAutenticado {
  id: number;
  nome: string;
  email: string;
}
