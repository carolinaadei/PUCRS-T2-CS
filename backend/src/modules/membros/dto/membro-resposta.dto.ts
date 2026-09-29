import { ApiProperty } from '@nestjs/swagger';
import { PermissaoMembro } from '@prisma/client';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

/** RF18 a RF20 - vinculo de um colaborador com a viagem. */
export class MembroDto {
  @ApiProperty({ example: 3, description: 'Id do vinculo (nao do usuario): e o {membroId}' })
  id!: number;

  @ApiProperty({ example: 'A3KD9F2P' })
  viagemId!: string;

  @ApiProperty({ example: 2 })
  usuarioId!: number;

  @ApiProperty({ enum: PermissaoMembro, example: PermissaoMembro.VISUALIZADOR })
  permissao!: PermissaoMembro;

  @ApiProperty({ example: '2026-09-21T12:00:00.000Z' })
  entrouEm!: Date;

  @ApiProperty({ type: UsuarioResumoDto })
  usuario!: UsuarioResumoDto;
}
