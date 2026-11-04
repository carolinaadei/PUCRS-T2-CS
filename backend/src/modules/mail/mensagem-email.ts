export interface Destinatario {
  email: string;
  nome?: string;
}

/** E-mail pronto para envio. E tambem o corpo das mensagens da fila SQS. */
export interface MensagemEmail {
  para: Destinatario;
  assunto: string;
  html: string;
  texto: string;
}

/**
 * Le o corpo de uma mensagem da fila. Devolve null para o que nao for um
 * e-mail completo: a fila aceita qualquer texto, e uma mensagem fora do formato
 * nao pode derrubar as outras do lote nem o worker.
 */
export function lerMensagemEmail(corpo: string | undefined): MensagemEmail | null {
  let valor: Partial<MensagemEmail> | null;
  try {
    valor = JSON.parse(corpo ?? '') as Partial<MensagemEmail> | null;
  } catch {
    return null;
  }

  const completo =
    typeof valor?.para?.email === 'string' &&
    typeof valor.assunto === 'string' &&
    typeof valor.html === 'string' &&
    typeof valor.texto === 'string';

  return completo ? (valor as MensagemEmail) : null;
}

/** Quem efetivamente entrega o e-mail: SES, Brevo ou o proprio log. */
export interface ProvedorEmail {
  readonly nome: string;
  enviar(mensagem: MensagemEmail): Promise<void>;
}

export const PROVEDOR_EMAIL = Symbol('PROVEDOR_EMAIL');
