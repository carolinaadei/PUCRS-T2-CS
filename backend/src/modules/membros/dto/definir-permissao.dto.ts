import { ApiProperty } from '@nestjs/swagger';
import { PermissaoMembro } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Define o nivel de permissao do colaborador na viagem. */
export class DefinirPermissaoDto {
  @ApiProperty({
    enum: PermissaoMembro,
    example: PermissaoMembro.EDITOR,
    description:
      'EDITOR pode adicionar, editar e remover destinos, atividades e orcamento; ' +
      'VISUALIZADOR tem acesso somente leitura',
  })
  @IsEnum(PermissaoMembro, {
    message: 'Permissao invalida: use EDITOR ou VISUALIZADOR',
  })
  permissao!: PermissaoMembro;
}
