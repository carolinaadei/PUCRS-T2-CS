import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { DestinosService } from './destinos.service';
import { AdicionarDestinoViagemDto } from './dto/adicionar-destino-viagem.dto';
import { AtualizarDestinoViagemDto } from './dto/atualizar-destino-viagem.dto';

/** Roteiro da viagem: quais destinos do catalogo entram e em que ordem. */
@ApiTags('Destinos - Viagem')
@ApiBearerAuth()
@Controller('viagens/:viagemId/destinos')
@UseGuards(AcessoViagemGuard)
@ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' })
export class DestinosViagemController {
  constructor(private readonly destinosService: DestinosService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({ summary: 'RF08 - Listar destinos da viagem na ordem de visita' })
  listar(@Param('viagemId') viagemId: string) {
    return this.destinosService.listarDaViagem(viagemId);
  }

  @Post()
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RF08, RN02 - Adicionar destino a viagem' })
  adicionar(@Param('viagemId') viagemId: string, @Body() dto: AdicionarDestinoViagemDto) {
    return this.destinosService.adicionarNaViagem(viagemId, dto);
  }

  @Patch(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RN02 - Editar datas, descricao ou ordem do destino' })
  atualizar(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIntPipe) destinoId: number,
    @Body() dto: AtualizarDestinoViagemDto,
  ) {
    return this.destinosService.atualizarNaViagem(viagemId, destinoId, dto);
  }

  @Delete(':destinoId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'RN02 - Remover destino da viagem' })
  remover(
    @Param('viagemId') viagemId: string,
    @Param('destinoId', ParseIntPipe) destinoId: number,
  ) {
    return this.destinosService.removerDaViagem(viagemId, destinoId);
  }
}
