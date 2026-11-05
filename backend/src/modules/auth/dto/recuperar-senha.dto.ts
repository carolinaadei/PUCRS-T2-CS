import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

/** Pedido do codigo de recuperacao de senha. */
export class RecuperarSenhaDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180, { message: 'O e-mail deve ter no maximo 180 caracteres' })
  email!: string;
}
