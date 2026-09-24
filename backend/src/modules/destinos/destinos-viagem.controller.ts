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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { DestinosService } from './destinos.service';
import { AdicionarDestinoViagemDto } from './dto/adicionar-destino-viagem.dto';
import { AtualizarDestinoViagemDto } from './dto/atualizar-destino-viagem.dto';
import { DestinoViagemDto, DestinoViagemListaDto } from './dto/destino-resposta.dto';

const ApiParamDestino = () =>
  ApiParam({
    name: 'destinoId',
    description: 'Id do destino na viagem (nao o do catalogo)',
    example: 4,
  });

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
    summary: 'RF08 - Listar destinos da viagem na ordem de visita',
    description: 'Cada destino vem com os dados do catalogo e o total de atividades.',
  })
  @ApiOkResponse({ type: [DestinoViagemListaDto] })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(@Param('viagemId') viagemId: string) {
    return this.destinosService.listarDaViagem(viagemId);
  }

  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'RF08, RN02 - Adicionar destino a viagem',
    description: 'Sem `ordem`, o destino vai para o fim do roteiro. Exige EDITOR.',
  })
  @ApiCreatedResponse({ type: DestinoViagemDto })
  @ApiErroValidacao('destinoCatalogoId must be an integer number')
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'destino do catalogo inexistente')
  adicionar(@Param('viagemId') viagemId: string, @Body() dto: AdicionarDestinoViagemDto) {
    return this.destinosService.adicionarNaViagem(viagemId, dto);
  }

  @Patch(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamDestino()
  @ApiOperation({
    summary: 'RN02 - Editar datas, descricao ou ordem do destino',
    description: 'Para trocar a cidade, remova o destino e adicione outro. Exige EDITOR.',
  })
  @ApiOkResponse({ type: DestinoViagemDto })
  @ApiErroValidacao('chegada must be a valid ISO 8601 date string')
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'destino nao encontrado nesta viagem')
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIntPipe) destinoId: number,
    @Body() dto: AtualizarDestinoViagemDto,
  ) {
    return this.destinosService.atualizarNaViagem(viagemId, destinoId, dto);
  }

  @Delete(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamDestino()
  @ApiOperation({
    summary: 'RN02 - Remover destino da viagem',
    description: 'Remove tambem as atividades do destino. Exige EDITOR.',
  })
  @ApiNoContentResponse({ description: 'Destino removido' })
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'destino nao encontrado nesta viagem')
  remover(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIntPipe) destinoId: number,
  ) {
    return this.destinosService.removerDaViagem(viagemId, destinoId);
  }
}
