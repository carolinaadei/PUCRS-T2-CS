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
  ApiTags,
} from '@nestjs/swagger';
import { ContextoDaViagem } from '../../common/decorators/contexto-viagem.decorator';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { ContextoViagem, UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { BuscarViagensDto } from './dto/buscar-viagens.dto';
import { AtualizarViagemDto, CriarViagemDto } from './dto/criar-viagem.dto';
import { PaginaViagensDto, ViagemDetalheDto, ViagemDto } from './dto/viagem-resposta.dto';
import { ViagensService } from './viagens.service';

const ApiPeriodoInvalido = () =>
  ApiErro(
    400,
    [CodigoErro.PERIODO_INVALIDO, CodigoErro.DATA_INEXISTENTE],
    'Fim antes do inicio, fim sem inicio ou dia inexistente no calendario',
  );

@ApiTags('Viagens')
@ApiAutenticado()
@Controller('viagens')
@UseGuards(AcessoViagemGuard)
export class ViagensController {
  constructor(private readonly viagensService: ViagensService) {}

  @Post()
  @ApiOperation({
    summary: 'Criar viagem',
    description:
      'Cria a viagem com nome e, se quiser, descricao e datas de inicio e fim (aaaa-mm-dd). ' +
      'A resposta traz o `codigoConvite` para chamar colaboradores.',
  })
  @ApiCreatedResponse({ type: ViagemDto })
  @ApiErroValidacao(
    'O nome da viagem nao pode ficar em branco',
    'Informe a data de inicio no formato aaaa-mm-dd (ex.: 2027-01-10)',
  )
  @ApiPeriodoInvalido()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: CriarViagemDto,
  ): Promise<ViagemDto> {
    return this.viagensService.criar(usuario.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar minhas viagens',
    description:
      'Viagens que voce criou e aquelas em que colabora, pela data de inicio (sem data, por ' +
      'ultimo). Filtro opcional por status. Paginado.',
  })
  @ApiOkResponse({ type: PaginaViagensDto })
  @ApiErroValidacao('O limite deve ser no maximo 100')
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() filtro: BuscarViagensDto) {
    return this.viagensService.listarDoUsuario(usuario.id, filtro);
  }

  @Get(':viagemId')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'Ver detalhes da viagem',
    description: 'Inclui criador, colaboradores, destinos e orcamento. So para quem participa.',
  })
  @ApiOkResponse({ type: ViagemDetalheDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  detalhar(
    @Param('viagemId') viagemId: string,
    @ContextoDaViagem() contexto: ContextoViagem,
  ): Promise<ViagemDetalheDto> {
    return this.viagensService.buscarDetalhe(viagemId, contexto.papel);
  }

  @Patch(':viagemId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'Editar viagem',
    description:
      'Altera nome, descricao, datas ou status. Envie so o que muda; `null` apaga a descricao ' +
      'ou uma das datas. O novo periodo precisa conter as datas dos destinos. Exige EDITOR.',
  })
  @ApiOkResponse({ type: ViagemDto })
  @ApiErroValidacao('Status invalido: use EM_PLANEJAMENTO, CONFIRMADA, CONCLUIDA')
  @ApiErro(
    400,
    [CodigoErro.PERIODO_INVALIDO, CodigoErro.DESTINOS_FORA_DO_PERIODO, CodigoErro.DATA_INEXISTENTE],
    'Periodo incoerente, ou destinos ficariam fora dele',
  )
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR)
  atualizar(
    @Param('viagemId') viagemId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @ContextoDaViagem() contexto: ContextoViagem,
    @Body() dto: AtualizarViagemDto,
  ): Promise<ViagemDto> {
    return this.viagensService.atualizar(viagemId, usuario, contexto.papel, dto);
  }

  @Delete(':viagemId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'Excluir viagem',
    description:
      'Apaga tambem destinos, atividades, colaboradores, orcamento e notificacoes. So o criador.',
  })
  @ApiNoContentResponse({ description: 'Viagem excluida' })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR)
  remover(@Param('viagemId') viagemId: string): Promise<void> {
    return this.viagensService.remover(viagemId);
  }
}
