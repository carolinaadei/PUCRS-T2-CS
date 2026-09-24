import { ApiProperty } from '@nestjs/swagger';

/** RF02 - Dados de resposta para o encerramento de sessao (logout). */
export class RespostaLogoutDto {
  /** Mensagem descritiva de confirmacao da operacao. */
  @ApiProperty({
    example: 'Logout realizado com sucesso',
    description: 'Mensagem confirmando o encerramento da sessao',
  })
  mensagem!: string;
}

