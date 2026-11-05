import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamId,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AvaliacoesService } from './avaliacoes.service';
import { AvaliacaoDto, PaginaAvaliacoesDto } from './dto/avaliacao-resposta.dto';
import { SalvarAvaliacaoDto } from './dto/salvar-avaliacao.dto';

const ApiParamAtividade = () => ApiParamId('atividadeId', 'Id da atividade no catalogo');
const ApiAtividadeInexistente = () =>
  ApiErro(
    404,
    CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA,
    'Atividade nao encontrada no catalogo',
  );

@ApiTags('Avaliacoes')
@Controller('atividades/:atividadeId/avaliacoes')
@ApiParamAtividade()
export class AvaliacoesController {
  constructor(private readonly avaliacoesService: AvaliacoesService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Listar as avaliacoes de uma atividade',
    description: 'Publico. Mais recentes primeiro, paginado.',
  })
  @ApiOkResponse({ type: PaginaAvaliacoesDto })
  @ApiErroValidacao('O limite deve ser no maximo 100')
  @ApiAtividadeInexistente()
  listar(@Param('atividadeId', ParseIdPipe) atividadeId: number, @Query() paginacao: PaginacaoDto) {
    return this.avaliacoesService.listarDaAtividade(atividadeId, paginacao);
  }

  @Get('minha')
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Ver a minha avaliacao',
    description: 'Para preencher o formulario de avaliacao com o que o usuario ja deu.',
  })
  @ApiOkResponse({ type: AvaliacaoDto })
  @ApiErro(
    404,
    [CodigoErro.AVALIACAO_NAO_ENCONTRADA, CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA],
    'Voce ainda nao avaliou, ou a atividade nao existe',
  )
  buscarMinha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('atividadeId', ParseIdPipe) atividadeId: number,
  ): Promise<AvaliacaoDto> {
    return this.avaliacoesService.buscarMinha(usuario.id, atividadeId);
  }

  @Put('minha')
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Avaliar uma atividade (criar ou substituir)',
    description:
      'Uma avaliacao por usuario: 201 na primeira, 200 quando substitui. So avalia quem tem a ' +
      'atividade CONCLUIDA (ou a viagem CONCLUIDA) numa viagem de que participa. Recalcula a media.',
  })
  @ApiCreatedResponse({ type: AvaliacaoDto, description: 'Primeira avaliacao do usuario' })
  @ApiOkResponse({ type: AvaliacaoDto, description: 'Avaliacao anterior substituida' })
  @ApiErroValidacao('A nota deve ser de 1 a 5')
  @ApiErro(
    403,
    CodigoErro.ATIVIDADE_NAO_REALIZADA,
    'Voce nao concluiu esta atividade em nenhuma viagem',
  )
  @ApiAtividadeInexistente()
  async salvarMinha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('atividadeId', ParseIdPipe) atividadeId: number,
    @Body() dto: SalvarAvaliacaoDto,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<AvaliacaoDto> {
    const { avaliacao, criada } = await this.avaliacoesService.salvarMinha(
      usuario.id,
      atividadeId,
      dto,
    );

    resposta.status(criada ? HttpStatus.CREATED : HttpStatus.OK);
    return avaliacao;
  }

  @Delete('minha')
  @ApiAutenticado()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remover a minha avaliacao',
    description: 'Recalcula a media da atividade.',
  })
  @ApiNoContentResponse({ description: 'Avaliacao removida' })
  @ApiErro(
    404,
    [CodigoErro.AVALIACAO_NAO_ENCONTRADA, CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA],
    'Voce ainda nao avaliou, ou a atividade nao existe',
  )
  removerMinha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('atividadeId', ParseIdPipe) atividadeId: number,
  ): Promise<void> {
    return this.avaliacoesService.removerMinha(usuario.id, atividadeId);
  }
}
