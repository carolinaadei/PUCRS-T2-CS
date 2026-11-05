import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../common/erros/codigos-erro';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../common/types/usuario-autenticado';
import { CatalogoAtividadeDto } from '../modules/atividades/dto/atividade-resposta.dto';
import { DestinoCatalogoDto } from '../modules/destinos/dto/destino-resposta.dto';
import {
  BuscarCidadesDto,
  BuscarLugaresDto,
  ImportarLugarDto,
  LugarExternoDto,
} from './geoapify.dto';
import { GeoapifyService } from './geoapify.service';

@ApiTags('Lugares - Geoapify')
@ApiAutenticado()
@ApiErroValidacao('Parametros invalidos')
@ApiErro(
  429,
  CodigoErro.MUITAS_REQUISICOES,
  'Ate 20 chamadas por minuto por IP em cada rota externa',
)
@ApiErro(
  503,
  [CodigoErro.GEOAPIFY_INDISPONIVEL, CodigoErro.GEOAPIFY_LIMITE],
  'Busca externa indisponivel, sem chave ou com cota esgotada',
)
@Throttle({ global: { limit: 20, ttl: 60_000 } })
@Controller('lugares')
export class GeoapifyController {
  constructor(private readonly geoapify: GeoapifyService) {}

  @Get('cidades')
  @ApiOperation({
    summary: 'Buscar ou autocompletar cidades',
    description:
      'Geocodificacao externa; autocompletar=true retorna sugestoes. Nao grava no catalogo. Cache de 5 minutos; exibir as atribuicoes no cliente.',
  })
  @ApiOkResponse({ type: [LugarExternoDto] })
  cidades(@Query() dto: BuscarCidadesDto) {
    return this.geoapify.cidades(dto);
  }

  @Get('atividades')
  @ApiOperation({
    summary: 'Buscar lugares proximos',
    description:
      'Busca externa por tipo e raio, com ate 20 resultados. Consulte primeiro o catalogo local. OUTRO busca locais de lazer (leisure).',
  })
  @ApiOkResponse({ type: [LugarExternoDto] })
  atividades(@Query() dto: BuscarLugaresDto) {
    return this.geoapify.atividades(dto);
  }

  @Post('destinos/importar')
  @ApiOperation({
    summary: 'Importar cidade para o catalogo',
    description:
      'Valida os detalhes no fornecedor. Importacao repetida retorna 201 com o mesmo item, preservando autoria e conteudo. O fornecedor pode canonizar idExterno.',
  })
  @ApiCreatedResponse({ type: DestinoCatalogoDto })
  @ApiErro(404, CodigoErro.LUGAR_NAO_ENCONTRADO, 'Lugar externo inexistente')
  @ApiErro(400, CodigoErro.LUGAR_INVALIDO, 'O lugar nao e uma cidade com pais')
  importarDestino(@Body() dto: ImportarLugarDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.geoapify.importarDestino(dto.idExterno, usuario.id);
  }

  @Post('atividades/importar')
  @ApiOperation({
    summary: 'Importar lugar para o catalogo de atividades',
    description:
      'Valida no fornecedor e guarda a origem e os creditos. Importacao repetida retorna 201 com o mesmo item, sem sobrescrever fotos, avaliacoes ou autor. Use o id interno retornado para agendar na viagem.',
  })
  @ApiCreatedResponse({ type: CatalogoAtividadeDto })
  @ApiErro(404, CodigoErro.LUGAR_NAO_ENCONTRADO, 'Lugar externo inexistente')
  importarAtividade(@Body() dto: ImportarLugarDto, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.geoapify.importarAtividade(dto.idExterno, usuario.id);
  }
}

@Module({ controllers: [GeoapifyController], providers: [GeoapifyService] })
export class GeoapifyModule {}
