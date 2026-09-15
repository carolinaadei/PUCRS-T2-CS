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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AvaliacoesService } from './avaliacoes.service';
import { CriarAvaliacaoDto } from './dto/criar-avaliacao.dto';

@ApiTags('Avaliacoes')
@Controller()
export class AvaliacoesController {
  constructor(private readonly avaliacoesService: AvaliacoesService) {}

  @Publico()
  @Get('atividades/:atividadeId/avaliacoes')
  @ApiOperation({ summary: 'RF23, RN01 - Listar reviews de uma atividade' })
  listar(@Param('atividadeId', ParseIntPipe) atividadeId: number) {
    return this.avaliacoesService.listarDaAtividade(atividadeId);
  }

  @Post('atividades/:atividadeId/avaliacoes')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'RF22, RN05 - Avaliar uma atividade (1 a 5 estrelas)' })
  avaliar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('atividadeId', ParseIntPipe) atividadeId: number,
    @Body() dto: CriarAvaliacaoDto,
  ) {
    return this.avaliacoesService.avaliar(usuario.id, atividadeId, dto);
  }

  @Delete('avaliacoes/:avaliacaoId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover a propria avaliacao' })
  remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('avaliacaoId', ParseIntPipe) avaliacaoId: number,
  ) {
    return this.avaliacoesService.remover(usuario.id, avaliacaoId);
  }
}
