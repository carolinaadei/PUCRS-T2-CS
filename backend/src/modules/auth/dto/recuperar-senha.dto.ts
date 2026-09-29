import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

/** RF03 - solicitacao do link de redefinicao de senha. */
export class RecuperarSenhaDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180)
  email!: string;
}
