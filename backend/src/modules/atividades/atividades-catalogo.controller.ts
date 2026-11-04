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
import { AtividadesService } from './atividades.service';
import {
  AtividadeDetalheDto,
  CatalogoAtividadeDto,
  PaginaAtividadesDto,
} from './dto/atividade-resposta.dto';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import {
  AtualizarCatalogoAtividadeDto,
  CriarCatalogoAtividadeDto,
} from './dto/criar-catalogo-atividade.dto';

const ApiParamAtividade = () => ApiParamId('id', 'Id da atividade no catalogo');
const ApiNaoEncontrada = () =>
  ApiErro(
    404,
    CodigoErro.ATIVIDADE_CATALOGO_NAO_ENCONTRADA,
    'Atividade nao encontrada no catalogo',
  );
const ApiSoQuemCadastrou = () =>
  ApiErro(403, CodigoErro.APENAS_QUEM_CADASTROU, 'So quem cadastrou pode alterar ou excluir');
const ApiPlaceIdDuplicado = () =>
  ApiErro(409, CodigoErro.GOOGLE_PLACE_ID_DUPLICADO, 'Ja existe atividade com este googlePlaceId');

/** Catalogo global de atividades e locais. As consultas sao publicas. */
@ApiTags('Atividades - Catalogo')
@Controller('atividades')
export class AtividadesCatalogoController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'Catalogo de atividades com busca e filtros',
    description:
      'Publico. Busca por nome; filtros por tipo, cidade, pais e nota minima. Ordenado pela ' +
      'melhor media.',
  })
  @ApiOkResponse({ type: PaginaAtividadesDto })
  @ApiErroValidacao('A nota minima nao pode ser maior que 5')
  buscar(@Query() filtros: BuscarAtividadesDto) {
    return this.atividadesService.buscarNoCatalogo(filtros);
  }

  @Publico()
  @Get('destaques')
  @ApiOperation({
    summary: 'Atividades mais bem avaliadas',
    description: 'Publico. As 10 melhores medias entre as atividades ja avaliadas.',
  })
  @ApiOkResponse({ type: [CatalogoAtividadeDto] })
  destaques(): Promise<CatalogoAtividadeDto[]> {
    return this.atividadesService.listarDestaques();
  }

  @Publico()
  @Get(':id')
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Pagina publica da atividade',
    description: 'Publico. Dados, media, total de avaliacoes e as 20 avaliacoes mais recentes.',
  })
  @ApiOkResponse({ type: AtividadeDetalheDto })
  @ApiErroValidacao('O parametro id deve ser um numero inteiro positivo')
  @ApiNaoEncontrada()
  detalhar(@Param('id', ParseIdPipe) id: number): Promise<AtividadeDetalheDto> {
    return this.atividadesService.buscarDoCatalogo(id);
  }

  @Post()
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Cadastrar atividade no catalogo',
    description:
      'Qualquer usuario autenticado cadastra; so ele podera editar ou excluir. Para a foto, ' +
      'envie o arquivo por POST /uploads e use a `urlPublica` em `fotoUrl`.',
  })
  @ApiCreatedResponse({ type: CatalogoAtividadeDto })
  @ApiErroValidacao(
    'Tipo de atividade invalido: use PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
  )
  @ApiPlaceIdDuplicado()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: CriarCatalogoAtividadeDto,
  ): Promise<CatalogoAtividadeDto> {
    return this.atividadesService.criarNoCatalogo(usuario.id, dto);
  }

  @Patch(':id')
  @ApiAutenticado()
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Editar atividade do catalogo',
    description: 'So quem cadastrou. Envie so o que muda; `null` apaga um campo opcional.',
  })
  @ApiOkResponse({ type: CatalogoAtividadeDto })
  @ApiErroValidacao('Informe uma URL valida para a foto')
  @ApiSoQuemCadastrou()
  @ApiNaoEncontrada()
  @ApiPlaceIdDuplicado()
  atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIdPipe) id: number,
    @Body() dto: AtualizarCatalogoAtividadeDto,
  ): Promise<CatalogoAtividadeDto> {
    return this.atividadesService.atualizarNoCatalogo(usuario.id, id, dto);
  }

  @Delete(':id')
  @ApiAutenticado()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamAtividade()
  @ApiOperation({
    summary: 'Excluir atividade do catalogo',
    description: 'So quem cadastrou, e so se nenhuma viagem a agendou e ninguem mais a avaliou.',
  })
  @ApiNoContentResponse({ description: 'Atividade excluida' })
  @ApiSoQuemCadastrou()
  @ApiNaoEncontrada()
  @ApiErro(
    409,
    CodigoErro.CATALOGO_EM_USO,
    'A atividade esta em viagens ou tem avaliacoes de outros',
  )
  remover(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Param('id', ParseIdPipe) id: number,
  ): Promise<void> {
    return this.atividadesService.removerDoCatalogo(usuario.id, id);
  }
}
