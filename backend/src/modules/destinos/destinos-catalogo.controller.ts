import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { DestinosService } from './destinos.service';
import { BuscarDestinosDto } from './dto/buscar-destinos.dto';
import { CriarDestinoCatalogoDto } from './dto/criar-destino-catalogo.dto';

/** Catalogo global de destinos (cidades), compartilhado entre todas as viagens. */
@ApiTags('Destinos - Catalogo')
@Controller('destinos')
export class DestinosCatalogoController {
  constructor(private readonly destinosService: DestinosService) {}

  @Publico()
  @Get()
  @ApiOperation({ summary: 'RF10, RN01 - Pesquisar destinos do catalogo' })
  buscar(@Query() filtros: BuscarDestinosDto) {
    return this.destinosService.buscarNoCatalogo(filtros);
  }

  @Publico()
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um destino do catalogo' })
  detalhar(@Param('id', ParseIntPipe) id: number) {
    return this.destinosService.buscarDoCatalogoPorId(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'RF09 - Cadastrar destino no catalogo' })
  criar(@Body() dto: CriarDestinoCatalogoDto) {
    return this.destinosService.criarNoCatalogo(dto);
  }
}
