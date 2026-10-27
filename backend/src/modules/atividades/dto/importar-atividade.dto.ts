import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Importa um local do Google Places para o catalogo (Secao 2 da arquitetura). */
export class ImportarAtividadeDto {
  @ApiProperty({
    example: 'ChIJ1Ww5Hc80GQ0RXkYcB6Ew3xE',
    description: 'Identificador do local na Google Places API',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  googlePlaceId!: string;
}
