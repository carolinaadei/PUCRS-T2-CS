import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
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
} from '../../common/swagger/api-respostas.decorator';
import { DestinosService } from './destinos.service';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';
import { CriarDestinoCatalogoDto } from './dto/criar-destino-catalogo.dto';
import { DestinoCatalogoDto, PaginaDestinosDto } from './dto/destino-resposta.dto';

/** Catalogo global de destinos (cidades), compartilhado entre todas as viagens. */
@ApiTags('Destinos - Catalogo')
@Controller('destinos')
export class DestinosCatalogoController {
  constructor(private readonly destinosService: DestinosService) {}

  @Publico()
  @Get()
  @ApiOperation({
    summary: 'RF10, RN01 - Pesquisar destinos do catalogo',
    description: 'Publico. Busca por nome, filtros por categoria e pais, paginado.',
  })
  @ApiOkResponse({ type: PaginaDestinosDto })
  @ApiErroValidacao(
    'categoria must be one of the following values: CIDADE, PRAIA, NATUREZA, CULTURAL',
  )
  buscar(@Query() filtros: BuscarDestinosDto) {
    return this.destinosService.buscarNoCatalogo(filtros);
  }

  @Publico()
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um destino do catalogo', description: 'Publico.' })
  @ApiParam({ name: 'id', description: 'Id do destino no catalogo', example: 1 })
  @ApiOkResponse({ type: DestinoCatalogoDto })
  @ApiErro(404, 'Destino nao encontrado no catalogo')
  detalhar(@Param('id', ParseIntPipe) id: number) {
    return this.destinosService.buscarDoCatalogoPorId(id);
  }

  @Post()
  @ApiAutenticado()
  @ApiOperation({
    summary: 'RF09 - Cadastrar destino no catalogo',
    description: 'Qualquer usuario autenticado pode cadastrar.',
  })
  @ApiCreatedResponse({ type: DestinoCatalogoDto })
  @ApiErroValidacao('nome should not be empty', 'latitude must be a latitude string or number')
  criar(@Body() dto: CriarDestinoCatalogoDto) {
    return this.destinosService.criarNoCatalogo(dto);
  }
}
