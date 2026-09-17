import { ApiProperty } from '@nestjs/swagger';

/** RF03 - resposta generica, identica em todos os ambientes (nunca expoe o token). */
export class RespostaRecuperacaoDto {
  @ApiProperty({
    example: 'Se houver uma conta com este e-mail, enviaremos as instrucoes de redefinicao.',
  })
  mensagem!: string;
}
