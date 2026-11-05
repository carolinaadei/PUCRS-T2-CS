import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Troca de senha de quem esta logado. */
export class TrocarSenhaDto {
  @ApiProperty({ example: 'senha12345' })
  @IsString({ message: 'A senha atual deve ser um texto' })
  @IsNotEmpty({ message: 'Informe a senha atual' })
  @MaxLength(72, { message: 'A senha atual deve ter no maximo 72 caracteres' })
  senhaAtual!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', minLength: 8, maxLength: 72 })
  @IsString({ message: 'A nova senha deve ser um texto' })
  @MinLength(8, { message: 'A nova senha deve ter no minimo 8 caracteres' })
  @MaxLength(72, { message: 'A nova senha deve ter no maximo 72 caracteres' })
  novaSenha!: string;

  @ApiProperty({ example: 'novaSenhaSegura123', description: 'Repeticao da nova senha' })
  @IsString({ message: 'A confirmacao deve ser um texto' })
  @IsNotEmpty({ message: 'Confirme a nova senha' })
  confirmarNovaSenha!: string;
}

/** Confirmacao da exclusao da conta: a senha, para um token roubado nao bastar. */
export class ExcluirContaDto {
  @ApiProperty({ example: 'senha12345' })
  @IsString({ message: 'A senha deve ser um texto' })
  @IsNotEmpty({ message: 'Informe a sua senha para confirmar' })
  @MaxLength(72, { message: 'A senha deve ter no maximo 72 caracteres' })
  senha!: string;
}
