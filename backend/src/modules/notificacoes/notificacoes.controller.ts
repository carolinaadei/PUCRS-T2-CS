import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamId,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { BuscarNotificacoesDto } from './dto/buscar-notificacoes.dto';
import {
  ContagemNotificacoesDto,
  MarcacaoEmLoteDto,
  MarcarNotificacaoDto,
  NotificacaoDto,
  PaginaNotificacoesDto,
} from './dto/notificacao.dto';
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
      'Alteracoes feitas por outras pessoas nas viagens de que voce participa, mais recentes ' +
      'primeiro. Voce nao e notificado do que voce mesmo fez.',
  })
  @ApiOkResponse({ type: PaginaNotificacoesDto })
  @ApiErroValidacao('O filtro apenasNaoLidas deve ser verdadeiro ou falso')
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() filtro: BuscarNotificacoesDto) {
    return this.notificacoesService.listarDoUsuario(usuario.id, filtro);
  }

  @Get('contagem')
  @ApiOperation({
    summary: 'Contar notificacoes nao lidas',
    description: 'Para o contador do sino, sem trazer a lista.',
  })
  @ApiOkResponse({ type: ContagemNotificacoesDto })
  contar(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<ContagemNotificacoesDto> {
    return this.notificacoesService.contar(usuario.id);
  }

  @Post('marcar-como-lidas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marcar todas como lidas',
    description: 'Marca como lidas todas as suas notificacoes ainda nao lidas.',
  })
  @ApiOkResponse({ type: MarcacaoEmLoteDto })
  marcarTodas(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<MarcacaoEmLoteDto> {
    return this.notificacoesService.marcarTodasComoLidas(usuario.id);
  }

  @Patch(':notificacaoId')
  @ApiParamId('notificacaoId', 'Id da notificacao')
  @ApiOperation({
    summary: 'Marcar uma notificacao como lida ou nao lida',
    description: 'So o destinatario pode alterar a propria notificacao.',
  })
  @ApiOkResponse({ type: NotificacaoDto })
  @ApiErroValidacao('O campo lida deve ser verdadeiro ou falso')
  @ApiErro(404, CodigoErro.NOTIFICACAO_NAO_ENCONTRADA, 'Notificacao nao encontrada')
  marcar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('notificacaoId', ParseIdPipe) notificacaoId: number,
    @Body() dto: MarcarNotificacaoDto,
  ): Promise<NotificacaoDto> {
    return this.notificacoesService.marcar(usuario.id, notificacaoId, dto.lida);
  }
}
