import { ApiProperty } from '@nestjs/swagger';

/**
 * RF03 - resposta da etapa 2. O `tokenTroca` nao e o codigo do e-mail: e uma
 * credencial de vida curta, emitida apenas depois que o codigo conferiu, e e a
 * unica coisa que autoriza a troca da senha na etapa 3.
 */
export class RespostaVerificacaoDto {
  @ApiProperty({
    description: 'Enviar em POST /auth/redefinir-senha',
    example: 'vnr3z0b0JYpWs33QFwB0GEL0dsr5rwla7squkm6PYeU',
  })
  tokenTroca!: string;

  @ApiProperty({ example: '2026-09-17T21:45:00.000Z', description: 'Fim da validade do token' })
  expiraEm!: string;
}
