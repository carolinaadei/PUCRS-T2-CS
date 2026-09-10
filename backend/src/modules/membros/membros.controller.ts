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
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { DefinirPermissaoDto } from './dto/definir-permissao.dto';
import { MembrosService } from './membros.service';

@ApiTags('Colaboracao')
@ApiBearerAuth()
@Controller('viagens/:viagemId/membros')
@UseGuards(AcessoViagemGuard)
@ApiParam({ name: 'viagemId', description: 'Codigo da viagem', example: 'A3KD9F2P' })
export class MembrosController {
  constructor(private readonly membrosService: MembrosService) {}

  // Sem @NivelAcesso: quem entra ainda nao e membro. O proprio codigo da viagem
  // funciona como convite (RF18).
  @Post('entrar')
  @ApiOperation({ summary: 'RF18 - Entrar na viagem pelo codigo de convite' })
  entrar(@Param('viagemId') viagemId: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.membrosService.entrar(viagemId, usuario.id);
  }

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({ summary: 'Listar colaboradores da viagem' })
  listar(@Param('viagemId') viagemId: string) {
    return this.membrosService.listar(viagemId);
  }

  @Patch(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @ApiOperation({ summary: 'RF20, RN04 - Alterar permissao de um colaborador' })
  definirPermissao(
    @Param('viagemId') viagemId: string,
    @Param('membroId', ParseIntPipe) membroId: number,
    @Body() dto: DefinirPermissaoDto,
  ) {
    return this.membrosService.definirPermissao(viagemId, membroId, dto.permissao);
  }

  @Delete('sair')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sair da viagem' })
  sair(@Param('viagemId') viagemId: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.membrosService.sair(viagemId, usuario.id);
  }

  @Delete(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'RF20, RN04 - Remover colaborador da viagem' })
  remover(@Param('viagemId') viagemId: string, @Param('membroId', ParseIntPipe) membroId: number) {
    return this.membrosService.remover(viagemId, membroId);
  }
}
