import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** RF03 - troca efetiva da senha usando o token recebido por e-mail. */
export class RedefinirSenhaDto {
  @ApiProperty({ description: 'Token recebido no link enviado por e-mail' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  novaSenha!: string;
}
