import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { OpcionalNaoNulo } from '../../../common/validacao/opcional';

export class AtualizarPerfilDto {
  @ApiPropertyOptional({ example: 'Bruno Lima' })
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @OpcionalNaoNulo()
  @IsString({ message: 'O nome deve ser um texto' })
  @MinLength(2, { message: 'O nome deve ter no minimo 2 caracteres' })
  @MaxLength(120, { message: 'O nome deve ter no maximo 120 caracteres' })
  nome?: string;
}
