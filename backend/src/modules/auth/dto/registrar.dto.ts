import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** RF01 - cadastro de conta com nome, e-mail e senha. */
export class RegistrarDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nome!: string;

  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180)
  email!: string;

  @ApiProperty({ example: 'senhaSegura123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  senha!: string;
}
