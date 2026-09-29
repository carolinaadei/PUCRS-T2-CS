import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** RF01 - cadastro de conta com nome, e-mail e senha. */
export class RegistrarDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString({ message: 'O nome deve ser um texto' })
  @IsNotEmpty({ message: 'O nome nao pode ficar em branco' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome!: string;

  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180, { message: 'O e-mail deve ter no maximo 180 caracteres' })
  email!: string;

  @ApiProperty({ example: 'senhaSegura123', minLength: 8 })
  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  senha!: string;
}
