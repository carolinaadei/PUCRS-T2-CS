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
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
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
import { DestinosService } from './destinos.service';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';
import {
  AtualizarDestinoCatalogoDto,
  CriarDestinoCatalogoDto,
} from './dto/criar-destino-catalogo.dto';
import {
  DestinoCatalogoDto,
  DestinoDestaqueDto,
  PaginaDestinosDto,
} from './dto/destino-resposta.dto';

const ApiParamDestino = () => ApiParamId('id', 'Id do destino no catalogo');
const ApiNaoEncontrado = () =>
  ApiErro(404, CodigoErro.DESTINO_CATALOGO_NAO_ENCONTRADO, 'Destino nao encontrado no catalogo');
const ApiSoQuemCadastrou = () =>
  ApiErro(403, CodigoErro.APENAS_QUEM_CADASTROU, 'So quem cadastrou pode alterar ou excluir');

/** Catalogo global de destinos (cidades), compartilhado entre todas as viagens. */
@ApiTags('Destinos - Catalogo')
@Controller('destinos')
export class DestinosCatalogoController {
  constructor(private readonly destinosService: DestinosService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Pesquisar destinos do catalogo',
    description: 'Publico. Busca por parte do nome; filtros por categoria e pais. Paginado.',
  })
  @ApiOkResponse({ type: PaginaDestinosDto })
  @ApiErroValidacao('Categoria invalida: use CIDADE, PRAIA, NATUREZA, CULTURAL')
  buscar(@Query() filtros: BuscarDestinosDto) {
    return this.destinosService.buscarNoCatalogo(filtros);
  }

  @Publico()
  @Get('destaques')
  @ApiOperation({
    summary: 'Destinos mais bem avaliados',
    description:
      'Publico. Os 10 destinos com a maior media nas avaliacoes das atividades feitas neles.',
  })
  @ApiOkResponse({ type: [DestinoDestaqueDto] })
  destaques(): Promise<DestinoDestaqueDto[]> {
    return this.destinosService.listarDestaques();
  }

  @Publico()
  @Get(':id')
  @ApiParamDestino()
  @ApiOperation({ summary: 'Detalhe de um destino do catalogo', description: 'Publico.' })
  @ApiOkResponse({ type: DestinoCatalogoDto })
  @ApiErroValidacao('O parametro id deve ser um numero inteiro positivo')
  @ApiNaoEncontrado()
  detalhar(@Param('id', ParseIdPipe) id: number): Promise<DestinoCatalogoDto> {
    return this.destinosService.buscarDoCatalogo(id);
  }

  @Post()
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Cadastrar destino no catalogo',
    description:
      'Qualquer usuario autenticado cadastra; so ele podera editar ou excluir. Para a foto, ' +
      'envie o arquivo por POST /uploads e use a `urlPublica` em `fotoUrl`.',
  })
  @ApiCreatedResponse({ type: DestinoCatalogoDto })
  @ApiErroValidacao('O nome do destino nao pode ficar em branco')
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: CriarDestinoCatalogoDto,
  ): Promise<DestinoCatalogoDto> {
    return this.destinosService.criarNoCatalogo(usuario.id, dto);
  }

  @Patch(':id')
  @ApiAutenticado()
  @ApiParamDestino()
  @ApiOperation({
    summary: 'Editar destino do catalogo',
    description: 'So quem cadastrou. Envie so o que muda; `null` apaga um campo opcional.',
  })
  @ApiOkResponse({ type: DestinoCatalogoDto })
  @ApiErroValidacao('Informe uma latitude valida (entre -90 e 90)')
  @ApiSoQuemCadastrou()
  @ApiNaoEncontrado()
  atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AtualizarDestinoCatalogoDto,
  ): Promise<DestinoCatalogoDto> {
    return this.destinosService.atualizarNoCatalogo(usuario.id, id, dto);
  }

  @Delete(':id')
  @ApiAutenticado()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamDestino()
  @ApiOperation({
    summary: 'Excluir destino do catalogo',
    description: 'So quem cadastrou, e so se nenhuma viagem o usa.',
  })
  @ApiNoContentResponse({ description: 'Destino excluido' })
  @ApiSoQuemCadastrou()
  @ApiNaoEncontrado()
  @ApiErro(409, CodigoErro.CATALOGO_EM_USO, 'O destino esta no roteiro de alguma viagem')
  remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIdPipe) id: number,
  ): Promise<void> {
    return this.destinosService.removerDoCatalogo(usuario.id, id);
  }
}
