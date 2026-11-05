import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana.souza@example.com' })
  @IsEmail({}, { message: 'Informe um e-mail valido' })
  @MaxLength(180, { message: 'O e-mail deve ter no maximo 180 caracteres' })
  email!: string;

  @ApiProperty({ example: 'senha12345' })
  @IsString({ message: 'A senha deve ser um texto' })
  @IsNotEmpty({ message: 'A senha e obrigatoria' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  senha!: string;
}
