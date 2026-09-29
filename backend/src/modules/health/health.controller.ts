import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SaudeDto } from './dto/saude.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Verifica se a API e o banco estao respondendo',
    description: 'Publico. Com o banco fora do ar, responde 200 com `status: degradado`.',
  })
  @ApiOkResponse({ type: SaudeDto })
  async verificar(): Promise<SaudeDto> {
    let banco: SaudeDto['banco'] = 'ok';

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
