import { ApiPropertyOptional } from '@nestjs/swagger';
import { StatusViagem } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginacaoDto } from '../../../common/dto/paginacao.dto';

export class BuscarViagensDto extends PaginacaoDto {
  @ApiPropertyOptional({ enum: StatusViagem, enumName: 'StatusViagem' })
  @IsEnum(StatusViagem, {
    message: `Status invalido: use ${Object.values(StatusViagem).join(', ')}`,
  })
  @IsOptional()
  status?: StatusViagem;
}
