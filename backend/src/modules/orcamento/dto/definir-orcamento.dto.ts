import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, Max } from 'class-validator';

/**
 * Maior valor que cabe em `orcamento.valor_total`, um Decimal(10,2). Acima
 * disso o Postgres recusa a escrita e a API responderia 500 em vez de 400.
 */
export const VALOR_MAXIMO_ORCAMENTO = 99_999_999.99;

/** Define o orcamento total da viagem. */
export class DefinirOrcamentoDto {
  @ApiProperty({
    example: 12000.5,
    minimum: 0.01,
    maximum: VALOR_MAXIMO_ORCAMENTO,
    description: 'Orcamento total da viagem, com ate duas casas decimais',
  })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    {
      message:
        'Informe o orcamento total como um numero com ate duas casas decimais (ex.: 12000.50)',
    },
  )
  // Zero nao serve de base para os percentuais do resumo; para ficar sem
  // orcamento, a viagem usa o DELETE.
  @IsPositive({ message: 'O orcamento total deve ser maior que zero' })
  @Max(VALOR_MAXIMO_ORCAMENTO, {
    message: `O orcamento total deve ser de no maximo ${VALOR_MAXIMO_ORCAMENTO}`,
  })
  valorTotal!: number;
}
