import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  @ApiOperation({ summary: 'Verifica se a API e o banco estao respondendo' })
  async verificar() {
    let banco = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      banco = 'indisponivel';
    }

    return {
      status: banco === 'ok' ? 'ok' : 'degradado',
      banco,
      timestamp: new Date().toISOString(),
    };
  }
}
