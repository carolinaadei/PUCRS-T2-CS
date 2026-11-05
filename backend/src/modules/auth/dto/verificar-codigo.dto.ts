import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, Matches, MaxLength } from 'class-validator';

/** Etapa 2 da recuperacao: confere o codigo de 6 digitos recebido por e-mail. */
export class VerificarCodigoDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180, { message: 'O e-mail deve ter no maximo 180 caracteres' })
  email!: string;

  @ApiProperty({ example: '418239', description: 'Codigo de 6 digitos enviado por e-mail' })
  // String, e nao number: o codigo pode comecar com zero.
  @Matches(/^\d{6}$/, { message: 'O codigo deve ter exatamente 6 digitos' })
  codigo!: string;
}
