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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { ParseIdOpcionalPipe, ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamId,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AtividadesService } from './atividades.service';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import { AtividadeViagemDto, AtividadeViagemListaDto } from './dto/atividade-resposta.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';

const ApiParamAtividade = () =>
  ApiParamId('atividadeId', 'Id da atividade na viagem (nao o do catalogo)');

const ApiDestinoDeOutraViagem = () =>
  ApiErro(
    400,
    [CodigoErro.DESTINO_DE_OUTRA_VIAGEM, CodigoErro.DATA_INEXISTENTE],
    'O destino informado nao pertence a esta viagem, ou a data nao existe',
  );

/** Atividades agendadas dentro dos destinos de uma viagem. */
@ApiTags('Atividades - Viagem')
@ApiAutenticado()
@Controller('viagens/:viagemId/atividades')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class AtividadesViagemController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiQuery({
    name: 'destinoViagemId',
    required: false,
    type: Number,
    description: 'So as atividades deste destino da viagem',
    example: 1,
  })
  @ApiOperation({
    summary: 'Listar atividades em ordem cronologica por destino',
    description:
      'Ordenadas pela ordem de visita do destino e depois pelo horario (sem horario, por ultimo).',
  })
  @ApiOkResponse({ type: [AtividadeViagemListaDto] })
  @ApiDestinoDeOutraViagem()
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(
    @Param('viagemId') viagemId: string,
    @Query('destinoViagemId', ParseIdOpcionalPipe) destinoViagemId?: number,
  ): Promise<AtividadeViagemListaDto[]> {
    return this.atividadesService.listarDaViagem(viagemId, destinoViagemId);
  }

  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'Adicionar atividade a um destino',
    description:
      'Agenda uma atividade do catalogo e recalcula o previsto do orcamento. Exige EDITOR.',
  })
  @ApiCreatedResponse({ type: AtividadeViagemDto })
  @ApiErroValidacao('Informe data e horario em ISO 8601 com fuso (ex.: 2027-01-11T14:30:00-03:00)')
  @ApiDestinoDeOutraViagem()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA])
  adicionar(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: AdicionarAtividadeViagemDto,
  ): Promise<AtividadeViagemDto> {
    return this.atividadesService.adicionarNaViagem(viagemId, usuario, dto);
  }

  @Patch(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Editar atividade (destino, horario, duracao, custo, status)',
    description:
      'Envie so o que muda; `null` apaga horario, duracao ou custo. Recalcula o orcamento. ' +
      'Exige EDITOR.',
  })
  @ApiOkResponse({ type: AtividadeViagemDto })
  @ApiErroValidacao('O custo previsto nao pode ser negativo')
  @ApiDestinoDeOutraViagem()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.ATIVIDADE_NAO_ENCONTRADA])
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIdPipe) atividadeId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarAtividadeViagemDto,
  ): Promise<AtividadeViagemDto> {
    return this.atividadesService.atualizarNaViagem(viagemId, atividadeId, usuario, dto);
  }

  @Delete(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Remover atividade da viagem',
    description: 'Recalcula o previsto do orcamento. Exige EDITOR.',
  })
  @ApiNoContentResponse({ description: 'Atividade removida' })
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, [CodigoErro.ATIVIDADE_NAO_ENCONTRADA])
  remover(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIdPipe) atividadeId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.atividadesService.removerDaViagem(viagemId, atividadeId, usuario);
  }
}
