import { ApiProperty, PickType } from '@nestjs/swagger';
import { UsuarioResumoDto } from '../../auth/dto/resposta-autenticacao.dto';

export class CriadorDoConviteDto extends PickType(UsuarioResumoDto, ['id', 'nome'] as const) {}

/** O que quem recebeu o codigo ve antes de aceitar. */
export class ConviteDto {
  @ApiProperty({ example: 'DEMO2027', description: 'Id da viagem, usado nas demais rotas' })
  viagemId!: string;

  @ApiProperty({ example: 'Eurotrip 2027' })
  nome!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-10' })
  dataInicio!: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-01-25' })
  dataFim!: string | null;

  @ApiProperty({ type: CriadorDoConviteDto })
  criador!: CriadorDoConviteDto;

  @ApiProperty({ example: 2, description: 'Colaboradores que ja entraram, sem contar o criador' })
  totalColaboradores!: number;
}

export class CodigoConviteDto {
  @ApiProperty({ example: 'K7M2Q9XA', description: 'Novo codigo; o anterior deixou de valer' })
  codigoConvite!: string;
}
