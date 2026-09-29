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

/** Catalogo global de atividades/locais, enriquecido pela Google Places API. */
@ApiTags('Atividades - Catalogo')
@Controller('atividades')
export class AtividadesCatalogoController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'RF24, RN01 - Catalogo de atividades com busca e filtros',
    description:
      'Publico. Busca por nome; filtros por tipo, cidade, pais e nota minima. ' +
      'Ordenado pela media de avaliacoes.',
  })
  @ApiOkResponse({ type: PaginaAtividadesDto })
  @ApiErroValidacao('notaMinima must not be greater than 5')
  buscar(@Query() filtros: BuscarAtividadesDto) {
    return this.atividadesService.buscarNoCatalogo(filtros);
  }

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

  @Post()
  @ApiAutenticado()
  @ApiOperation({
    summary: 'Cadastrar atividade no catalogo',
    description: 'Cadastro manual. O `googlePlaceId`, se informado, e unico.',
  })
  @ApiCreatedResponse({ type: CatalogoAtividadeDto })
  @ApiErroValidacao(
    'tipoAtividade must be one of the following values: PASSEIO, REFEICAO, HOSPEDAGEM, TRANSPORTE, OUTRO',
  )
  @ApiErro(
    409,
    'Ja existe atividade com este googlePlaceId',
    'Ja existe um registro com este valor em: google_place_id',
  )
  criar(@Body() dto: CriarCatalogoAtividadeDto) {
    return this.atividadesService.criarNoCatalogo(dto);
  }

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
