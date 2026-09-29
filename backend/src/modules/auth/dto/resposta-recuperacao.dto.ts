import { ApiProperty } from '@nestjs/swagger';

/** RF03 - resposta generica, identica em todos os ambientes (nunca expoe o codigo). */
export class RespostaRecuperacaoDto {
  @ApiProperty({
    example: 'Se houver uma conta com este e-mail, enviaremos um codigo de verificacao.',
  })
  mensagem!: string;
}
