import { ApiProperty } from '@nestjs/swagger';

export class VivoDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 3605.2, description: 'Segundos desde que o processo subiu' })
  uptime!: number;
}

export class ProntoDto {
  @ApiProperty({ enum: ['ok', 'indisponivel'], example: 'ok' })
  status!: 'ok' | 'indisponivel';

  @ApiProperty({ enum: ['ok', 'indisponivel'], example: 'ok' })
  banco!: 'ok' | 'indisponivel';

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  timestamp!: string;
}
