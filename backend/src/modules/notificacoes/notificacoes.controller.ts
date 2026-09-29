import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Patch,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiAutenticado,
  ApiErro,
  ApiNaoImplementado,
} from '../../common/swagger/api-respostas.decorator';
import { NotificacaoDto, PaginaNotificacoesDto } from './dto/notificacao.dto';

const PENDENTE = 'RF21 ainda nao implementado';

/**
 * RF21 - contrato planejado das notificacoes in-app. As rotas respondem 501
 * ate existirem a tabela e a emissao dos eventos (ver notificacoes.module.ts).
 */
@ApiTags('Notificacoes')
@ApiAutenticado()
@ApiNaoImplementado()
@Controller('notificacoes')
export class NotificacoesController {
  @Get()
  @ApiOperation({
    summary: 'RF21 - Listar minhas notificacoes (nao implementado)',
    description: 'Alteracoes relevantes nas viagens do usuario, mais recentes primeiro.',
  })
  @ApiQuery({ name: 'apenasNaoLidas', required: false, type: Boolean, example: true })
  @ApiQuery({ name: 'pagina', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limite', required: false, type: Number, example: 20 })
  @ApiOkResponse({ type: PaginaNotificacoesDto })
  listar(): never {
    throw new NotImplementedException(PENDENTE);
  }

  @Patch('lidas')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'RF21 - Marcar todas como lidas (nao implementado)',
    description: 'Marca como lidas todas as notificacoes do usuario.',
  })
  @ApiNoContentResponse({ description: 'Notificacoes marcadas como lidas' })
  marcarTodasComoLidas(): never {
    throw new NotImplementedException(PENDENTE);
  }

  @Patch(':notificacaoId/lida')
  @ApiOperation({
    summary: 'RF21 - Marcar notificacao como lida (nao implementado)',
    description: 'So o destinatario pode marcar a propria notificacao.',
  })
  @ApiParam({
    name: 'notificacaoId',
    type: Number,
    description: 'Id da notificacao',
    example: 15,
  })
  @ApiOkResponse({ type: NotificacaoDto })
  @ApiErro(404, 'Notificacao nao encontrada')
  marcarComoLida(): never {
    throw new NotImplementedException(PENDENTE);
  }
}
