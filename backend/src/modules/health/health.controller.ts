import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Publico } from '../../common/decorators/publico.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { ProntoDto, VivoDto } from './dto/saude.dto';

/**
 * Sondas para orquestradores (Docker, ECS, Kubernetes), fora do versionamento:
 * `/api/health/live` e `/api/health/ready`. Sem limite de requisicoes, porque
 * quem chama e a propria infraestrutura, a cada poucos segundos.
 */
@ApiTags('Health')
@Publico()
@SkipThrottle({ global: true })
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @ApiOperation({
    summary: 'O processo esta vivo?',
    description:
      'Nao toca no banco: responde 200 enquanto o processo atende. Se falhar, reinicie o container.',
  })
  @ApiOkResponse({ type: VivoDto })
  vivo(): VivoDto {
    return { status: 'ok', uptime: Math.round(process.uptime() * 10) / 10 };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'A API pode receber trafego?',
    description:
      'Confere o banco. 503 enquanto ele estiver fora: o balanceador tira a instancia de ' +
      'rotacao, sem reinicia-la.',
  })
  @ApiOkResponse({ type: ProntoDto })
  @ApiServiceUnavailableResponse({ type: ProntoDto, description: 'Banco indisponivel' })
  async pronto(@Res({ passthrough: true }) resposta: Response): Promise<ProntoDto> {
    let banco: ProntoDto['banco'] = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'indisponivel';
    }

    if (banco !== 'ok') {
      resposta.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return { status: banco, banco, timestamp: new Date().toISOString() };
  }
}
