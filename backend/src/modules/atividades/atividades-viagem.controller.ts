import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { AtividadesService } from './atividades.service';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';

@ApiTags('Atividades - Viagem')
@ApiBearerAuth()
@Controller('viagens/:viagemId/atividades')
@UseGuards(AcessoViagemGuard)
@ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' })
export class AtividadesViagemController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiQuery({ name: 'destinoViagemId', required: false, type: Number })
  @ApiOperation({ summary: 'RF14 - Listar atividades em ordem cronologica por destino' })
  listar(@Param('viagemId') viagemId: string, @Query('destinoViagemId') destinoViagemId?: string) {
    return this.atividadesService.listarDaViagem(
      viagemId,
      destinoViagemId ? Number(destinoViagemId) : undefined,
    );
  }

  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RF12, RF13, RN02 - Adicionar atividade a um destino' })
  adicionar(@Param('viagemId') viagemId: string, @Body() dto: AdicionarAtividadeViagemDto) {
    return this.atividadesService.adicionarNaViagem(viagemId, dto);
  }

  @Patch(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RF13, RN02 - Editar atividade (horario, custo, status)' })
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() dto: AtualizarAtividadeViagemDto,
  ) {
    return this.atividadesService.atualizarNaViagem(viagemId, atividadeId, dto);
  }

  @Delete(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'RN02 - Remover atividade da viagem' })
  remover(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
  ) {
    return this.atividadesService.removerDaViagem(viagemId, atividadeId);
  }
}
