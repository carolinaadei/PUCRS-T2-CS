import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Corpo padrao de erro do NestJS, igual em todas as rotas. */
export class ErroRespostaDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Viagem A3KD9F2P nao encontrada',
    description: 'Texto do erro; na validacao do corpo (400), uma lista com um item por campo',
  })
  message!: string | string[];

  @ApiPropertyOptional({ example: 'Not Found' })
  error?: string;
}
