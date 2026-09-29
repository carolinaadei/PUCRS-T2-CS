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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { PaginacaoDto } from '../../common/dto/paginacao.dto';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AtualizarViagemDto } from './dto/atualizar-viagem.dto';
import { CriarViagemDto } from './dto/criar-viagem.dto';
import { PaginaViagensDto, ViagemDetalheDto, ViagemDto } from './dto/viagem-resposta.dto';
import { ViagensService } from './viagens.service';

@ApiTags('Viagens')
@ApiAutenticado()
@Controller('viagens')
@UseGuards(AcessoViagemGuard)
export class ViagensController {
  constructor(private readonly viagensService: ViagensService) {}

  @Post()
  @ApiOperation({
    summary: 'RF04 - Criar viagem',
    description: 'O `id` gerado (8 caracteres) e tambem o codigo de convite (RF18).',
  })
  @ApiCreatedResponse({ type: ViagemDto })
  @ApiErroValidacao('nome should not be empty', 'dataInicio must be a valid ISO 8601 date string')
  criar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: CriarViagemDto) {
    return this.viagensService.criar(usuario.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'RF06 - Painel pessoal: viagens criadas e compartilhadas',
    description: 'Paginado, ordenado pela data de inicio.',
  })
  @ApiOkResponse({ type: PaginaViagensDto })
  @ApiErroValidacao('limite must not be greater than 100')
  listar(@UsuarioAtual() usuario: UsuarioAutenticado, @Query() paginacao: PaginacaoDto) {
    return this.viagensService.listarDoUsuario(usuario.id, paginacao);
  }

  @Get(':viagemId')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'RN06 - Detalhe da viagem',
    description: 'Inclui criador, colaboradores, destinos e orcamento. Somente membros.',
  })
  @ApiOkResponse({ type: ViagemDetalheDto })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  detalhar(@Param('viagemId') viagemId: string) {
    return this.viagensService.buscarPorId(viagemId);
  }

  @Patch(':viagemId')
  @NivelAcesso(NivelAcessoViagem.EDITOR)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'RF05, RF07 - Editar viagem e status',
    description: 'Envie so os campos que mudam. Exige EDITOR.',
  })
  @ApiOkResponse({ type: ViagemDto })
  @ApiErroValidacao(
    'status must be one of the following values: EM_PLANEJAMENTO, CONFIRMADA, CONCLUIDA',
  )
  @ApiAcessoViagem(NivelAcessoViagem.EDITOR)
  atualizar(@Param('viagemId') viagemId: string, @Body() dto: AtualizarViagemDto) {
    return this.viagensService.atualizar(viagemId, dto);
  }

  @Delete(':viagemId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamViagem()
  @ApiOperation({
    summary: 'RF05 - Excluir viagem',
    description: 'Apaga tambem destinos, atividades, colaboradores e orcamento. So o criador.',
  })
  @ApiNoContentResponse({ description: 'Viagem excluida' })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR)
  remover(@Param('viagemId') viagemId: string) {
    return this.viagensService.remover(viagemId);
  }
}
