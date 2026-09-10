import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { DefinirOrcamentoDto } from './dto/definir-orcamento.dto';
import { ResumoOrcamentoDto } from './dto/resumo-orcamento.dto';
import { OrcamentoService } from './orcamento.service';

@ApiTags('Orcamento')
@ApiBearerAuth()
@Controller('viagens/:viagemId/orcamento')
@UseGuards(AcessoViagemGuard)
@ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' })
export class OrcamentoController {
  constructor(private readonly orcamentoService: OrcamentoService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({ summary: 'Consultar o orcamento da viagem' })
  buscar(@Param('viagemId') viagemId: string) {
    return this.orcamentoService.buscar(viagemId);
  }

  @Get('resumo')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({ summary: 'RF17 - Painel de resumo financeiro' })
  resumir(@Param('viagemId') viagemId: string): Promise<ResumoOrcamentoDto> {
    return this.orcamentoService.resumir(viagemId);
  }

  @Put()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RF15, RN02 - Definir o orcamento total da viagem' })
  definir(@Param('viagemId') viagemId: string, @Body() dto: DefinirOrcamentoDto) {
    return this.orcamentoService.definir(viagemId, dto);
  }
}
