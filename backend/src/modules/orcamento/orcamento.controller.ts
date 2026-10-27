import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { DefinirOrcamentoDto } from './dto/definir-orcamento.dto';
import { OrcamentoDto } from './dto/orcamento-resposta.dto';
import { ResumoOrcamentoDto } from './dto/resumo-orcamento.dto';
import { OrcamentoService } from './orcamento.service';

@ApiTags('Orcamento')
@ApiAutenticado()
@Controller('viagens/:viagemId/orcamento')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class OrcamentoController {
  constructor(private readonly orcamentoService: OrcamentoService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'Consultar o orcamento da viagem',
    description: 'Valores monetarios chegam como string.',
  })
  @ApiOkResponse({ type: OrcamentoDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO, 'a viagem ainda nao tem orcamento definido')
  buscar(@Param('viagemId') viagemId: string) {
    return this.orcamentoService.buscar(viagemId);
  }

  @Get('resumo')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'RF17 - Painel de resumo financeiro',
    description: 'Sem orcamento definido, o total fica em 0 e os percentuais tambem.',
  })
  @ApiOkResponse({ type: ResumoOrcamentoDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  resumir(@Param('viagemId') viagemId: string): Promise<ResumoOrcamentoDto> {
    return this.orcamentoService.resumir(viagemId);
  }

  @Put()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'RF15, RN02 - Definir o orcamento total da viagem',
    description: 'Cria ou substitui o valor total. Exige EDITOR.',
  })
  @ApiOkResponse({ type: OrcamentoDto })
  @ApiErroValidacao('valorTotal must not be less than 0')
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR)
  definir(@Param('viagemId') viagemId: string, @Body() dto: DefinirOrcamentoDto) {
    return this.orcamentoService.definir(viagemId, dto);
  }
}
