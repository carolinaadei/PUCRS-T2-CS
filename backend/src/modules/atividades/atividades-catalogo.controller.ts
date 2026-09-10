import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { AtividadesService } from './atividades.service';
import { BuscarAtividadesDto } from './dto/buscar-atividades.dto';
import { CriarCatalogoAtividadeDto } from './dto/criar-catalogo-atividade.dto';

/** Catalogo global de atividades/locais, enriquecido pela Google Places API. */
@ApiTags('Atividades - Catalogo')
@Controller('atividades')
export class AtividadesCatalogoController {
  constructor(private readonly atividadesService: AtividadesService) {}

  @Publico()
  @Get()
  @ApiOperation({ summary: 'RF24, RN01 - Catalogo de atividades com busca e filtros' })
  buscar(@Query() filtros: BuscarAtividadesDto) {
    return this.atividadesService.buscarNoCatalogo(filtros);
  }

  @Publico()
  @Get('destaques')
  @ApiOperation({ summary: 'RF25 - Atividades mais bem avaliadas' })
  destaques() {
    return this.atividadesService.listarDestaques();
  }

  @Publico()
  @Get(':id')
  @ApiOperation({ summary: 'RF23 - Pagina publica da atividade com media e reviews' })
  detalhar(@Param('id', ParseIntPipe) id: number) {
    return this.atividadesService.buscarDoCatalogoPorId(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cadastrar atividade no catalogo' })
  criar(@Body() dto: CriarCatalogoAtividadeDto) {
    return this.atividadesService.criarNoCatalogo(dto);
  }
}
