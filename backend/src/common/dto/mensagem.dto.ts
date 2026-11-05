import { ApiProperty } from '@nestjs/swagger';

/** Resposta de operacoes que so confirmam o que foi feito. */
export class MensagemDto {
  @ApiProperty({ example: 'Operacao realizada com sucesso' })
  mensagem!: string;
}
