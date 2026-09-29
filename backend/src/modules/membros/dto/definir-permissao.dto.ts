import { ApiProperty } from '@nestjs/swagger';
import { PermissaoMembro } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** RF19, RF20 - nivel de permissao do colaborador. */
export class DefinirPermissaoDto {
  @ApiProperty({
    enum: PermissaoMembro,
    description: 'EDITOR pode alterar a viagem (RN02); VISUALIZADOR e somente leitura (RN03)',
  })
  @IsEnum(PermissaoMembro)
  permissao!: PermissaoMembro;
}
