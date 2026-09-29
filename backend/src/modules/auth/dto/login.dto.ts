import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/** RF02 - Dados de entrada para autenticacao de usuario (login). */
export class LoginDto {
  /** Endereco de e-mail cadastrado da conta. */
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsNotEmpty({ message: 'O e-mail e obrigatorio' })
  @IsEmail({}, { message: 'Formato de e-mail invalido' })
  email!: string;

  /** Senha em texto plano para autenticacao. */
  @ApiProperty({ example: 'senhaSegura123' })
  @IsString({ message: 'A senha deve ser uma string' })
  @IsNotEmpty({ message: 'A senha e obrigatoria' })
  senha!: string;
}
