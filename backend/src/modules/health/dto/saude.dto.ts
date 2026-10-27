import { ApiProperty } from '@nestjs/swagger';

export class SaudeDto {
  @ApiProperty({ enum: ['ok', 'degradado'], example: 'ok' })
  status!: 'ok' | 'degradado';

  @ApiProperty({ enum: ['ok', 'indisponivel'], example: 'ok' })
  banco!: 'ok' | 'indisponivel';

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  timestamp!: string;
}
