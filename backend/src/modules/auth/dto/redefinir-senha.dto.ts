import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Etapa 3 da recuperacao: troca efetiva da senha, autorizada pelo token de troca. */
export class RedefinirSenhaDto {
  @ApiProperty({
    description: 'Token devolvido por POST /auth/verificar-codigo',
    example: 'vnr3z0b0JYpWs33QFwB0GEL0dsr5rwla7squkm6PYeU',
  })
  @IsString({ message: 'O tokenTroca deve ser um texto' })
  @IsNotEmpty({ message: 'Informe o tokenTroca' })
  @MaxLength(200, { message: 'O tokenTroca deve ter no maximo 200 caracteres' })
  tokenTroca!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(8, { message: 'A senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  novaSenha!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', description: 'Repeticao da nova senha' })
  @IsString({ message: 'A confirmacao deve ser um texto' })
  @IsNotEmpty({ message: 'Confirme a nova senha' })
  confirmarNovaSenha!: string;
}
