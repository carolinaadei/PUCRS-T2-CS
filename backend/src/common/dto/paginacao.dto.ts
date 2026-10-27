import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Parametros de paginacao reutilizaveis nas listagens (RF06, RF24). */
export class PaginacaoDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Pagina desejada' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  pagina: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Itens por pagina' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limite: number = 20;

  get pular(): number {
    return (this.pagina - 1) * this.limite;
  }
}

/**
 * Campos do envelope paginado para o Swagger. Cada listagem estende esta
 * classe declarando `itens` com o tipo concreto, ja que o Swagger nao le
 * o generico de `RespostaPaginada<T>`.
 */
export class PaginaBaseDto {
  @ApiProperty({ example: 42, description: 'Total de itens em todas as paginas' })
  total!: number;

  @ApiProperty({ example: 1 })
  pagina!: number;

  @ApiProperty({ example: 20 })
  limite!: number;
}

/** Envelope padrao das respostas paginadas. */
export class RespostaPaginada<T> {
  itens: T[];
  total: number;
  pagina: number;
  limite: number;

  constructor(itens: T[], total: number, paginacao: PaginacaoDto) {
    this.itens = itens;
    this.total = total;
    this.pagina = paginacao.pagina;
    this.limite = paginacao.limite;
  }
}
