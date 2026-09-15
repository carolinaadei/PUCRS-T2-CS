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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AtualizarViagemDto } from './dto/atualizar-viagem.dto';
import { CriarViagemDto } from './dto/criar-viagem.dto';
import { ViagensService } from './viagens.service';

@ApiTags('Viagens')
@ApiBearerAuth()
@Controller('viagens')
@UseGuards(AcessoViagemGuard)
export class ViagensController {
  constructor(private readonly viagensService: ViagensService) {}

  @Post()
  @ApiOperation({ summary: 'RF04 - Criar viagem' })
  criar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: CriarViagemDto) {
    return this.viagensService.criar(usuario.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'RF06 - Painel pessoal: viagens criadas e compartilhadas' })
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() paginacao: PaginacaoDto) {
    return this.viagensService.listarDoUsuario(usuario.id, paginacao);
  }

  @Get(':viagemId')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' })
  @ApiOperation({ summary: 'RN06 - Detalhe da viagem (somente membros)' })
  detalhar(@Param('viagemId') viagemId: string) {
    return this.viagensService.buscarPorId(viagemId);
  }

  @Patch(':viagemId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiOperation({ summary: 'RF05, RF07 - Editar viagem e status' })
  atualizar(@Param('viagemId') viagemId: string, @Body() dto: AtualizarViagemDto) {
    return this.viagensService.atualizar(viagemId, dto);
  }

  @Delete(':viagemId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'RF05 - Excluir viagem (apenas o criador)' })
  remover(@Param('viagemId') viagemId: string) {
    return this.viagensService.remover(viagemId);
  }
}
