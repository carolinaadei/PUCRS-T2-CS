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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { AtividadesService } from './atividades.service';
import { AdicionarAtividadeViagemDto } from './dto/adicionar-atividade-viagem.dto';
import { AtividadeViagemDto, AtividadeViagemListaDto } from './dto/atividade-resposta.dto';
import { AtualizarAtividadeViagemDto } from './dto/atualizar-atividade-viagem.dto';

const ApiParamAtividade = () =>
  ApiParam({
    name: 'atividadeId',
    description: 'Id da atividade na viagem (nao o do catalogo)',
    example: 10,
  });

/** 400 de validacao ou de um destino que nao pertence a esta viagem. */
const ApiErroDestinoInvalido = () =>
  ApiErro(
    400,
    'Dados invalidos, ou o destino informado nao pertence a esta viagem',
    'O destino informado nao pertence a esta viagem',
  );

/**
 * Controller responsavel pelo gerenciamento das atividades dentro dos destinos de uma viagem
 * (Modulo 4 - RF12, RF13 e RF14). Protegido por `AcessoViagemGuard` (RN02, RN03 e RN06).
 */
@ApiTags('Atividades - Viagem')
@ApiAutenticado()
@Controller('viagens/:viagemId/atividades')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class AtividadesViagemController {
  constructor(private readonly atividadesService: AtividadesService) {}

  /**
   * RF14 - Lista as atividades da viagem em ordem cronologica por destino.
   * Permite filtrar opcionalmente por um destino especifico da viagem (`destinoViagemId`).
   */
  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiQuery({
    name: 'destinoViagemId',
    required: false,
    type: Number,
    description: 'Filtra por um destino da viagem',
    example: 4,
  })
  @ApiOperation({
    summary: 'RF14 - Listar atividades em ordem cronologica por destino',
    description: 'Ordenadas pela ordem de visita do destino e depois pelo horario.',
  })
  @ApiOkResponse({ type: [AtividadeViagemListaDto] })
  @ApiErroDestinoInvalido()
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(
    @Param('viagemId') viagemId: string,
    @Query('destinoViagemId', new ParseIntPipe({ optional: true })) destinoViagemId?: number,
  ) {
    return this.atividadesService.listarDaViagem(viagemId, destinoViagemId);
  }

  /**
   * RF12, RF13, RN02 - Adiciona uma atividade do catalogo dentro de um destino da viagem,
   * definindo horario, duracao estimada, custo previsto e status, e atualizando o orcamento (RF16).
   */
  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({
    summary: 'RF12, RF13, RN02 - Adicionar atividade a um destino',
    description:
      'Agenda uma atividade do catalogo e recalcula o previsto do orcamento (RF16). ' +
      'Exige EDITOR.',
  })
  @ApiCreatedResponse({ type: AtividadeViagemDto })
  @ApiErroDestinoInvalido()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'atividade do catalogo inexistente')
  adicionar(@Param('viagemId') viagemId: string, @Body() dto: AdicionarAtividadeViagemDto) {
    return this.atividadesService.adicionarNaViagem(viagemId, dto);
  }

  /**
   * RF13, RN02 - Atualiza parcialmente uma atividade agendada na viagem
   * (destino, data/horario, duracao estimada, custo previsto ou status) e recalcula o orcamento.
   */
  @Patch(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'RF13, RN02 - Editar atividade (horario, custo, status)',
    description: 'Envie so os campos que mudam; recalcula o orcamento. Exige EDITOR.',
  })
  @ApiOkResponse({ type: AtividadeViagemDto })
  @ApiErroDestinoInvalido()
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'atividade nao encontrada nesta viagem')
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() dto: AtualizarAtividadeViagemDto,
  ) {
    return this.atividadesService.atualizarNaViagem(viagemId, atividadeId, dto);
  }

  /**
   * RN02, RF16 - Remove uma atividade agendada da viagem e recalcula o previsto do orcamento.
   */
  @Delete(':atividadeId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'RN02 - Remover atividade da viagem',
    description: 'Recalcula o previsto do orcamento. Exige EDITOR.',
  })
  @ApiNoContentResponse({ description: 'Atividade removida' })
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR, 'atividade nao encontrada nesta viagem')
  remover(
    @Param('viagemId') viagemId: string,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
  ) {
    return this.atividadesService.removerDaViagem(viagemId, atividadeId);
  }
}
