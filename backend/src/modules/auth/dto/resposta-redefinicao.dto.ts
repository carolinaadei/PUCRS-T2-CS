import { ApiProperty } from '@nestjs/swagger';

/** RF03 - confirmacao da etapa 3. */
export class RespostaRedefinicaoDto {
  @ApiProperty({ example: 'Senha redefinida com sucesso' })
  mensagem!: string;
}
