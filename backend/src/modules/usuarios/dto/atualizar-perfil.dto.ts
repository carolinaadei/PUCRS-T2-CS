import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';
import { Aparar } from '../../../common/validacao/texto';

export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Bruno Lima' })
  @Aparar()
  @OpcionalNaoNulo()
  @IsString({ message: 'O nome deve ser um texto' })
  @MinLength(2, { message: 'O nome deve ter no minimo 2 caracteres' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome?: string;
}
