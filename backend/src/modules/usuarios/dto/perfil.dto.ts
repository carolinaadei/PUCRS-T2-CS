import { ApiProperty } from '@nestjs/swagger';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

/** Dados publicos do usuario autenticado: o hash de senha nunca sai do backend (RNF03). */
export class PerfilDto extends UsuarioResumoDto {
  @ApiProperty({ example: '2026-09-10T23:04:30.000Z' })
  criadoEm!: Date;
}

/** RF11 - pais no formato que o jsVectormap espera. */
export class PaisVisitadoDto {
  @ApiProperty({ example: 'PT', description: 'Codigo ISO 3166-1 alfa-2 (chave do jsVectormap)' })
  codigo!: string;

  @ApiProperty({ example: 'Portugal' })
  nome!: string;

  @ApiProperty({ example: 2, description: 'Viagens concluidas com destino no pais' })
  viagens!: number;
}
