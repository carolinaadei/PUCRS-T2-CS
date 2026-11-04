import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
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
    summary: 'Ver o orcamento da viagem',
    description:
      'Valor total, soma dos custos previstos das atividades e saldo. O previsto e ' +
      'atualizado a cada atividade ou destino alterado.',
  })
  @ApiOkResponse({ type: OrcamentoDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO, [CodigoErro.ORCAMENTO_NAO_DEFINIDO])
  buscar(@Param('viagemId') viagemId: string): Promise<OrcamentoDto> {
    return this.orcamentoService.buscar(viagemId);
  }

  @Get('resumo')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'Ver o resumo financeiro da viagem',
    description:
      'Orcamento total, total planejado nas atividades, saldo disponivel e quanto cada ' +
      'categoria de atividade consome do orcamento. Atividades sem custo previsto nao entram ' +
      'na conta. Sem orcamento, `orcamentoDefinido` vem `false` e o total e os percentuais, 0.',
  })
  @ApiOkResponse({ type: ResumoOrcamentoDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  resumir(@Param('viagemId') viagemId: string): Promise<ResumoOrcamentoDto> {
    return this.orcamentoService.resumir(viagemId);
  }

  @Put()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'Definir o orcamento da viagem',
    description: 'Cria o orcamento ou substitui o valor total ja definido. Exige EDITOR.',
  })
  @ApiOkResponse({ type: OrcamentoDto })
  @ApiErroValidacao(
    'O orcamento total deve ser maior que zero',
    'Informe o orcamento total como um numero com ate duas casas decimais (ex.: 12000.50)',
  )
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR)
  definir(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: DefinirOrcamentoDto,
  ): Promise<OrcamentoDto> {
    return this.orcamentoService.definir(viagemId, usuario, dto);
  }

  @Delete()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover o orcamento da viagem',
    description:
      'Apaga o valor total definido; os custos previstos continuam nas atividades. Exige EDITOR.',
  })
  @ApiNoContentResponse({ description: 'Orcamento removido' })
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.ORCAMENTO_NAO_DEFINIDO])
  remover(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.orcamentoService.remover(viagemId, usuario);
  }
}
