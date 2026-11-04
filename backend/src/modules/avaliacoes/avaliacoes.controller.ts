import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AvaliacoesService } from './avaliacoes.service';
import { AvaliacaoDto } from './dto/avaliacao-resposta.dto';
import { CriarAvaliacaoDto } from './dto/criar-avaliacao.dto';

const ApiParamAtividade = () =>
  ApiParam({ name: 'atividadeId', description: 'Id da atividade no catalogo', example: 1 });

/**
 * Controller responsavel pelas rotas de avaliacao de atividades (RF22, RF23, RN01 e RN05).
 * Gerencia a criacao, atualizacao, consulta publica e exclusao de reviews feitas por usuarios.
 */
@ApiTags('Avaliacoes')
@Controller()
export class AvaliacoesController {
  constructor(private readonly avaliacoesService: AvaliacoesService) {}

  /**
   * RF23, RN01 - Lista as reviews de uma atividade do catalogo em ordem decrescente de criacao.
   * Rota publica, acessivel inclusive para visitantes nao autenticados.
   */
  @Publico()
  @Get('atividades/:atividadeId/avaliacoes')
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Listar reviews de uma atividade',
    description: 'Publico. Mais recentes primeiro; lista vazia se nao houver.',
  })
  @ApiOkResponse({ type: [AvaliacaoDto] })
  @ApiErro(404, 'Atividade nao encontrada no catalogo')
  listar(@Param('atividadeId', ParseIntPipe) atividadeId: number) {
    return this.avaliacoesService.listarDaAtividade(atividadeId);
  }

  /**
   * RF22, RN05 - Registra ou atualiza a avaliacao (nota de 1 a 5 estrelas e comentario opcional)
   * de uma atividade por um usuario autenticado. Cada usuario pode avaliar a mesma atividade apenas uma vez;
   * avaliacoes subsequentes atualizam a nota anterior e recalculam a media geral.
   */
  @Post('atividades/:atividadeId/avaliacoes')
  @ApiAutenticado()
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Avaliar uma atividade (1 a 5 estrelas)',
    description:
      'Uma avaliacao por usuario: avaliar de novo substitui a anterior. Recalcula a media.',
  })
  @ApiCreatedResponse({ type: AvaliacaoDto })
  @ApiErroValidacao('A nota deve ser de 1 a 5')
  @ApiErro(404, 'Atividade nao encontrada no catalogo')
  avaliar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() dto: CriarAvaliacaoDto,
  ) {
    return this.avaliacoesService.avaliar(usuario.id, atividadeId, dto);
  }

  /**
   * RF22 - Exclui a avaliacao informada. Apenas o autor original tem permissao para remove-la.
   * Recalcula a media geral da atividade apos a exclusao.
   */
  @Delete('avaliacoes/:avaliacaoId')
  @ApiAutenticado()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'avaliacaoId', description: 'Id da avaliacao', example: 1 })
  @ApiOperation({
    summary: 'Remover a propria avaliacao',
    description: 'So o autor pode remover. Recalcula a media da atividade.',
  })
  @ApiNoContentResponse({ description: 'Avaliacao removida' })
  @ApiErro(
    403,
    'A avaliacao e de outro usuario',
    'Voce so pode remover as suas proprias avaliacoes',
  )
  @ApiErro(404, 'Avaliacao nao encontrada')
  remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('avaliacaoId', ParseIntPipe) avaliacaoId: number,
  ) {
    return this.avaliacoesService.remover(usuario.id, avaliacaoId);
  }
}
