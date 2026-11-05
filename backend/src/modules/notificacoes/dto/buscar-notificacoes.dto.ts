import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

/** Filtros e paginacao para listagem das notificacoes in-app do usuario. */
export class BuscarNotificacoesDto extends PaginacaoDto {
  @ApiPropertyOptional({
    description: 'Quando verdadeiro, retorna apenas as notificacoes ainda nao lidas',
    example: true,
    type: Boolean,
  })
  @Transform(({ obj, key, value }: TransformFnParams): unknown => {
    const bruto = (obj as Record<string, unknown> | undefined)?.[key] ?? value;
    if (bruto === 'true' || bruto === true) {
      return true;
    }
    if (bruto === 'false' || bruto === false) {
      return false;
    }
    return bruto;
  })
  @IsBoolean({ message: 'O filtro apenasNaoLidas deve ser verdadeiro ou falso' })
  @IsOptional()
  apenasNaoLidas?: boolean;
}
