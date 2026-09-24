import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** RF03 - etapa 3: troca efetiva da senha, autorizada pelo token de troca. */
export class RedefinirSenhaDto {
  @ApiProperty({
    description: 'Token devolvido por POST /auth/verificar-codigo',
    example: 'vnr3z0b0JYpWs33QFwB0GEL0dsr5rwla7squkm6PYeU',
  })
  @IsString()
  @IsNotEmpty()
  tokenTroca!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  novaSenha!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', description: 'Repeticao da nova senha' })
  @IsString()
  @IsNotEmpty({ message: 'Confirme a nova senha' })
  confirmarNovaSenha!: string;
}
