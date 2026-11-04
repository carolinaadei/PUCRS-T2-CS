import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { BuscarNotificacoesDto } from './dto/buscar-notificacoes.dto';
import { NotificacaoDto, PaginaNotificacoesDto } from './dto/notificacao.dto';
import { NotificacoesService } from './notificacoes.service';

@ApiTags('Notificacoes')
@ApiAutenticado()
@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly notificacoesService: NotificacoesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar minhas notificacoes',
    description:
      'Alteracoes relevantes nas viagens de que o usuario participa, mais recentes primeiro.',
  })
  @ApiOkResponse({ type: PaginaNotificacoesDto })
  @ApiErroValidacao(
    'O filtro apenasNaoLidas deve ser verdadeiro ou falso',
    'O limite deve ser no maximo 100',
  )
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() filtro: BuscarNotificacoesDto) {
    return this.notificacoesService.listarDoUsuario(usuario.id, filtro);
  }

  @Patch('lidas')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Marcar todas como lidas',
    description: 'Marca como lidas todas as notificacoes do usuario.',
  })
  @ApiNoContentResponse({ description: 'Notificacoes marcadas como lidas' })
  marcarTodasComoLidas(@UsuarioAtual() usuario: UsuarioAutenticado): void {
    this.notificacoesService.marcarTodasComoLidas(usuario.id);
  }

  @Patch(':notificacaoId/lida')
  @ApiOperation({
    summary: 'Marcar notificacao como lida',
    description: 'So o destinatario pode marcar a propria notificacao.',
  })
  @ApiParam({
    name: 'notificacaoId',
    type: Number,
    description: 'Id da notificacao',
    example: 1,
  })
  @ApiOkResponse({ type: NotificacaoDto })
  @ApiErro(404, 'Notificacao nao encontrada')
  marcarComoLida(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('notificacaoId', ParseIntPipe) notificacaoId: number,
  ): NotificacaoDto {
    return this.notificacoesService.marcarComoLida(usuario.id, notificacaoId);
  }
}
