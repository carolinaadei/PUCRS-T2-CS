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
    summary: 'Criar viagem',
    description:
      'Cria a viagem com nome e, se quiser, descricao e datas de inicio e fim. ' +
      'O `id` devolvido (8 caracteres) e tambem o codigo para convidar outras pessoas.',
  })
  @ApiCreatedResponse({ type: ViagemDto })
  @ApiErroValidacao(
    'O nome da viagem nao pode ficar em branco',
    'Informe a data de inicio no formato aaaa-mm-dd (ex.: 2027-01-10)',
    'A data de fim nao pode ser anterior a data de inicio',
  )
  criar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: CriarViagemDto) {
    return this.viagensService.criar(usuario.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Listar minhas viagens',
    description:
      'Viagens que voce criou e aquelas para as quais foi convidado, ' +
      'ordenadas pela data de inicio. Resultado paginado.',
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
    summary: 'Ver detalhes da viagem',
    description:
      'Inclui criador, colaboradores, destinos e orcamento. ' +
      'Disponivel apenas para quem participa da viagem.',
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
    summary: 'Editar viagem',
    description:
      'Altera nome, descricao, datas ou status. Envie apenas os campos que mudam; ' +
      '`null` apaga a descricao ou uma das datas. A data de fim nao pode ficar antes ' +
      'da de inicio, mesmo que so uma delas seja enviada. ' +
      'Permitido ao criador e aos colaboradores com permissao de edicao.',
  })
  @ApiOkResponse({ type: ViagemDto })
  @ApiErroValidacao(
    'Status invalido: use EM_PLANEJAMENTO, CONFIRMADA, CONCLUIDA',
    'A data de fim nao pode ser anterior a data de inicio',
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
    summary: 'Excluir viagem',
    description:
      'Apaga tambem destinos, atividades, colaboradores e orcamento. ' +
      'Apenas o criador pode excluir.',
  })
  @ApiNoContentResponse({ description: 'Viagem excluida' })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR)
  remover(@Param('viagemId') viagemId: string) {
    return this.viagensService.remover(viagemId);
  }
}
