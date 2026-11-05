import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamId,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { DestinosService } from './destinos.service';
import {
  AdicionarDestinoViagemDto,
  ReordenarDestinosDto,
} from './dto/adicionar-destino-viagem.dto';
import { AtualizarDestinoViagemDto } from './dto/atualizar-destino-viagem.dto';
import { DestinoViagemDto, DestinoViagemListaDto } from './dto/destino-resposta.dto';

const ApiParamDestino = () =>
  ApiParamId('destinoId', 'Id do destino na viagem (nao o do catalogo)');

const ApiDatasForaDoPeriodo = () =>
  ApiErro(
    400,
    [CodigoErro.DESTINO_FORA_DO_PERIODO, CodigoErro.DATA_INEXISTENTE],
    'Chegada ou saida fora das datas da viagem, saida antes da chegada ou dia inexistente',
  );

/** Roteiro da viagem: quais destinos do catalogo entram e em que ordem. */
@ApiTags('Destinos - Viagem')
@ApiAutenticado()
@Controller('viagens/:viagemId/destinos')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class DestinosViagemController {
  constructor(private readonly destinosService: DestinosService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'Listar o roteiro da viagem',
    description: 'Destinos em ordem de visita, com os dados do catalogo e o total de atividades.',
  })
  @ApiOkResponse({ type: [DestinoViagemListaDto] })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(@Param('viagemId') viagemId: string): Promise<DestinoViagemListaDto[]> {
    return this.destinosService.listarDaViagem(viagemId);
  }

  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'Adicionar destino a viagem',
    description:
      'Sem `ordem`, o destino vai para o fim do roteiro; com `ordem`, os seguintes andam uma ' +
      'posicao. Chegada e saida precisam caber no periodo da viagem. Exige EDITOR.',
  })
  @ApiCreatedResponse({ type: DestinoViagemDto })
  @ApiErroValidacao('Informe a chegada no formato aaaa-mm-dd (ex.: 2027-01-17)')
  @ApiDatasForaDoPeriodo()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.DESTINO_CATALOGO_NAO_ENCONTRADO])
  adicionar(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: AdicionarDestinoViagemDto,
  ): Promise<DestinoViagemDto> {
    return this.destinosService.adicionarNaViagem(viagemId, usuario, dto);
  }

  @Put('ordem')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'Reordenar o roteiro',
    description:
      'Recebe os ids de todos os destinos da viagem na nova ordem e devolve o roteiro ' +
      'atualizado. Exige EDITOR.',
  })
  @ApiOkResponse({ type: [DestinoViagemListaDto] })
  @ApiErroValidacao('A lista nao pode repetir destinos')
  @ApiErro(400, CodigoErro.ORDEM_INVALIDA, 'A lista nao corresponde aos destinos da viagem')
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR)
  reordenar(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: ReordenarDestinosDto,
  ): Promise<DestinoViagemListaDto[]> {
    return this.destinosService.reordenar(viagemId, usuario, dto.destinos);
  }

  @Patch(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamDestino()
  @ApiOperation({
    summary: 'Editar datas, descricao ou posicao do destino',
    description:
      'Envie so o que muda; `null` apaga chegada, saida ou descricao. Para trocar a cidade, ' +
      'remova o destino e adicione outro. Exige EDITOR.',
  })
  @ApiOkResponse({ type: DestinoViagemDto })
  @ApiErroValidacao('Informe a saida no formato aaaa-mm-dd (ex.: 2027-01-24)')
  @ApiDatasForaDoPeriodo()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.DESTINO_NAO_ENCONTRADO])
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIdPipe) destinoId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarDestinoViagemDto,
  ): Promise<DestinoViagemDto> {
    return this.destinosService.atualizarNaViagem(viagemId, destinoId, usuario, dto);
  }

  @Delete(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamDestino()
  @ApiOperation({
    summary: 'Remover destino da viagem',
    description:
      'Remove tambem as atividades do destino e recalcula o previsto do orcamento. ' +
      'Exige EDITOR.',
  })
  @ApiNoContentResponse({ description: 'Destino removido' })
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.DESTINO_NAO_ENCONTRADO])
  remover(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIdPipe) destinoId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.destinosService.removerDaViagem(viagemId, destinoId, usuario);
  }
}
