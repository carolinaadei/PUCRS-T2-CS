import { ApiProperty } from '@nestjs/swagger';

export class UsuarioResumoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Ana Souza' })
  nome!: string;

  @ApiProperty({ example: 'ana.souza@example.com' })
  email!: string;
}

/** Par de tokens devolvido por cadastro, login, refresh e troca de senha. */
export class RespostaAutenticacaoDto {
  @ApiProperty({ example: 'Bearer', enum: ['Bearer'] })
  tipoToken!: 'Bearer';

  @ApiProperty({
    description: 'JWT de vida curta, enviado em Authorization: Bearer <accessToken>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEsImVtYWlsIjoiYW5hIiwidmVyIjowfQ.x',
  })
  accessToken!: string;

  @ApiProperty({ example: '2027-01-10T12:15:00.000Z', description: 'Quando o accessToken expira' })
  accessTokenExpiraEm!: string;

  @ApiProperty({
    description:
      'Token opaco para POST /auth/refresh. Vale uma unica vez: cada refresh devolve um novo. ' +
      'Guarde-o com o mesmo cuidado de uma senha.',
    example: 'q0B9wPZx3cGkO6m7Zt6Hn0a5pQ2y8V1uR4sE7dF9gJk',
  })
  refreshToken!: string;

  @ApiProperty({ example: '2027-02-09T12:00:00.000Z', description: 'Quando o refreshToken expira' })
  refreshTokenExpiraEm!: string;

  @ApiProperty({ type: UsuarioResumoDto })
  usuario!: UsuarioResumoDto;
}
