import {
  Body,
  Controller,
  Get,
  NotImplementedException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiNaoImplementado,
} from '../../common/swagger/api-respostas.decorator';
import { AtividadesService } from './atividades.service';
import {
  AtividadeDestaqueDto,
  AtividadeDetalheDto,
  CatalogoAtividadeDto,
  PaginaAtividadesDto,
} from './dto/atividade-resposta.dto';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import { CriarCatalogoAtividadeDto } from './dto/criar-catalogo-atividade.dto';
import { ImportarAtividadeDto } from './dto/importar-atividade.dto';

/**
 * Controller responsavel pelo catalogo global de atividades e locais
 * (RF12, RF13, RF23 a RF25). Rotas de consulta sao publicas para visitantes (RN01).
 */
@ApiTags('Atividades - Catalogo')
@Controller('atividades')
export class AtividadesCatalogoController {
  constructor(private readonly atividadesService: AtividadesService) {}

  /**
   * RF24, RN01 - Busca paginada no catalogo publico de atividades com filtros.
   */
  @Publico()
  @Get()
  @ApiOperation({
    summary: 'RF24, RN01 - Catalogo de atividades com busca e filtros',
    description:
      'Publico. Busca por nome; filtros por tipo, cidade, pais e nota minima. ' +
      'Ordenado pela media de avaliacoes.',
  })
  @ApiOkResponse({ type: PaginaAtividadesDto })
  @ApiErroValidacao('A nota minima nao pode ser maior que 5')
  buscar(@Query() filtros: BuscarAtividadesDto) {
    return this.atividadesService.buscarNoCatalogo(filtros);
  }

  /**
   * RF25 - Lista as 10 atividades com maior media de avaliacoes.
   */
  @Publico()
  @Get('destaques')
  @ApiOperation({
    summary: 'RF25 - Atividades mais bem avaliadas',
    description: 'Publico. As 10 melhores medias entre as atividades ja avaliadas.',
  })
  @ApiOkResponse({ type: [AtividadeDestaqueDto] })
  destaques() {
    return this.atividadesService.listarDestaques();
  }

  /**
   * RF23 - Exibe a pagina publica detalhada da atividade com media e avaliacoes recentes.
   */
  @Publico()
  @Get(':id')
  @ApiOperation({
    summary: 'RF23 - Pagina publica da atividade com media e reviews',
    description: 'Publico. Traz as 20 avaliacoes mais recentes e o total de avaliacoes.',
  })
  @ApiParam({ name: 'id', description: 'Id da atividade no catalogo', example: 1 })
  @ApiOkResponse({ type: AtividadeDetalheDto })
  @ApiErro(404, 'Atividade nao encontrada no catalogo')
  detalhar(@Param('id', ParseIntPipe) id: number) {
    return this.atividadesService.buscarDoCatalogoPorId(id);
  }

  /**
   * RF12, RF13 - Cadastra uma nova atividade no catalogo (com nome, foto, tipo/categoria e local).
   */
  @Post()
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Cadastrar atividade no catalogo',
    description: 'Cadastro manual. O `googlePlaceId`, se informado, e unico.',
  })
  @ApiCreatedResponse({ type: CatalogoAtividadeDto })
  @ApiErroValidacao(
    'Tipo de atividade invalido. Valores permitidos: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
  )
  @ApiErro(
    409,
    'Ja existe atividade com este googlePlaceId',
    'Ja existe atividade com este googlePlaceId',
  )
  criar(@Body() dto: CriarCatalogoAtividadeDto) {
    return this.atividadesService.criarNoCatalogo(dto);
  }

  /**
   * Importa uma atividade a partir da Google Places API (pendente de integracao externa).
   */
  @Post('importar')
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Importar atividade do Google Places (nao implementado)',
    description:
      'Cria a atividade no catalogo a partir do `googlePlaceId`, com os dados da ' +
      'Google Places API (Secao 2 da arquitetura).',
  })
  @ApiBody({ type: ImportarAtividadeDto })
  @ApiCreatedResponse({ type: CatalogoAtividadeDto })
  @ApiErroValidacao('googlePlaceId should not be empty')
  @ApiErro(404, 'Local nao encontrado na Google Places API')
  @ApiNaoImplementado()
  importar(): never {
    // TODO: ver a integracao com a Google Places API em atividades.module.ts.
    throw new NotImplementedException('Importacao do Google Places ainda nao implementada');
  }
}
