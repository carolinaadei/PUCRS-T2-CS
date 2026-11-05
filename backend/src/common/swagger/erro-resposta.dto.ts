import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CodigoErro } from '../erros/codigos-erro';

export class ErroDeCampoDto {
  @ApiProperty({ example: 'nome', description: 'Caminho do campo; aninhados usam ponto' })
  campo!: string;

  @ApiProperty({ example: ['O nome nao pode ficar em branco'] })
  mensagens!: string[];
}

/** Corpo de toda resposta de erro da API. */
export class ErroRespostaDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    enum: Object.values(CodigoErro),
    enumName: 'CodigoErro',
    example: CodigoErro.VIAGEM_NAO_ENCONTRADA,
    description: 'Identificador estavel do erro: decida por ele, nao pela mensagem',
  })
  codigo!: CodigoErro;

  @ApiProperty({ example: 'Viagem nao encontrada', description: 'Texto para exibir ao usuario' })
  mensagem!: string;

  @ApiPropertyOptional({
    type: [ErroDeCampoDto],
    description: 'Presente nos erros de validacao (VALIDACAO)',
  })
  detalhes?: ErroDeCampoDto[];

  @ApiProperty({ example: '6f1c2b7e-1a4d-4c1e-9a8f-0d2b3c4e5f60' })
  requestId!: string;

  @ApiProperty({ example: '/api/v1/viagens/A3KD9F2P' })
  caminho!: string;

  @ApiProperty({ example: '2027-01-10T12:00:00.000Z' })
  timestamp!: string;
}
