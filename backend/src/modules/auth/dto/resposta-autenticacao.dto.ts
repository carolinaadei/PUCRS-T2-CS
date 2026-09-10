import { ApiProperty } from '@nestjs/swagger';

export class UsuarioResumoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Ana Souza' })
  nome!: string;

  @ApiProperty({ example: 'ana.souza@example.com' })
  email!: string;
}

export class RespostaAutenticacaoDto {
  @ApiProperty({ description: 'Token JWT a ser enviado em Authorization: Bearer <token>' })
  accessToken!: string;

  @ApiProperty({ type: UsuarioResumoDto })
  usuario!: UsuarioResumoDto;
}
