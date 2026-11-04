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

/** Quem efetivamente entrega o e-mail: SES, Brevo ou o proprio log. */
export interface ProvedorEmail {
  readonly nome: string;
  enviar(mensagem: MensagemEmail): Promise<void>;
}

export const PROVEDOR_EMAIL = Symbol('PROVEDOR_EMAIL');
