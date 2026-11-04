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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContextoDaViagem } from '../../common/decorators/contexto-viagem.decorator';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import { ParseIdPipe } from '../../common/pipes/parse-id.pipe';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamId,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { ContextoViagem, UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { CodigoConviteDto, ConviteDto } from './dto/convite.dto';
import { DefinirPermissaoDto } from './dto/definir-permissao.dto';
import { MembroDto } from './dto/membro-resposta.dto';
import { MembrosService } from './membros.service';

const ApiParamCodigo = () =>
  ApiParam({ name: 'codigo', description: 'Codigo de convite recebido', example: 'K7M2Q9XA' });

const ApiConviteInvalido = () =>
  ApiErro(404, CodigoErro.CONVITE_INVALIDO, 'Codigo de convite invalido ou substituido');

/** Quem recebeu o codigo ve a viagem e aceita o convite. */
@ApiTags('Colaboracao')
@ApiAutenticado()
@Controller('convites')
export class ConvitesController {
  constructor(private readonly membrosService: MembrosService) {}

  @Get(':codigo')
  @ApiParamCodigo()
  @ApiOperation({
    summary: 'Ver a viagem de um convite',
    description: 'Nome, datas e criador da viagem, para confirmar antes de aceitar.',
  })
  @ApiOkResponse({ type: ConviteDto })
  @ApiConviteInvalido()
  ver(@Param('codigo') codigo: string): Promise<ConviteDto> {
    return this.membrosService.verConvite(codigo);
  }

  // Encarece a tentativa de adivinhar codigos (sao ~10^12 combinacoes).
  @Throttle({ global: { limit: 20, ttl: 60_000 } })
  @Post(':codigo/aceitar')
  @ApiParamCodigo()
  @ApiOperation({
    summary: 'Aceitar um convite',
    description: 'Entra na viagem como VISUALIZADOR; o criador pode promover a EDITOR depois.',
  })
  @ApiCreatedResponse({ type: MembroDto })
  @ApiConviteInvalido()
  @ApiErro(409, CodigoErro.JA_PARTICIPA, 'Voce ja e criador ou colaborador desta viagem')
  aceitar(
    @Param('codigo') codigo: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<MembroDto> {
    return this.membrosService.aceitarConvite(codigo, usuario);
  }
}

/** O criador troca o codigo, por exemplo depois de compartilha-lo por engano. */
@ApiTags('Colaboracao')
@ApiAutenticado()
@Controller('viagens/:viagemId/convite')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class ConviteViagemController {
  constructor(private readonly membrosService: MembrosService) {}

  @Post()
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gerar um novo codigo de convite',
    description:
      'O codigo anterior deixa de valer na hora; quem ja entrou continua na viagem. So o criador.',
  })
  @ApiOkResponse({ type: CodigoConviteDto })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR)
  gerar(@Param('viagemId') viagemId: string): Promise<CodigoConviteDto> {
    return this.membrosService.gerarNovoConvite(viagemId);
  }
}

@ApiTags('Colaboracao')
@ApiAutenticado()
@Controller('viagens/:viagemId/membros')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class MembrosController {
  constructor(private readonly membrosService: MembrosService) {}

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'Listar colaboradores da viagem',
    description: 'Por ordem de entrada. O criador nao aparece aqui (veja `criador` na viagem).',
  })
  @ApiOkResponse({ type: [MembroDto] })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(@Param('viagemId') viagemId: string): Promise<MembroDto[]> {
    return this.membrosService.listar(viagemId);
  }

  // Declarada antes de ':membroId' para "eu" nao ser lido como um id.
  @Delete('eu')
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sair da viagem',
    description: 'O colaborador deixa a viagem. O criador nao sai: ele exclui a viagem.',
  })
  @ApiNoContentResponse({ description: 'Voce saiu da viagem' })
  @ApiErro(400, CodigoErro.CRIADOR_NAO_SAI, 'O criador nao pode sair da propria viagem')
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  sair(
    @ContextoDaViagem() contexto: ContextoViagem,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.membrosService.sair(contexto, usuario);
  }

  @Patch(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @ApiParamId('membroId', 'Id do vinculo (campo `id` do colaborador), nao o do usuario')
  @ApiOperation({
    summary: 'Alterar a permissao de um colaborador',
    description: 'Alterna entre EDITOR e VISUALIZADOR. So o criador.',
  })
  @ApiOkResponse({ type: MembroDto })
  @ApiErroValidacao('Permissao invalida: use EDITOR ou VISUALIZADOR')
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR, [CodigoErro.MEMBRO_NAO_ENCONTRADO])
  definirPermissao(
    @Param('viagemId') viagemId: string,
    @Param('membroId', ParseIdPipe) membroId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: DefinirPermissaoDto,
  ): Promise<MembroDto> {
    return this.membrosService.definirPermissao(viagemId, membroId, dto.permissao, usuario);
  }

  @Delete(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamId('membroId', 'Id do vinculo (campo `id` do colaborador), nao o do usuario')
  @ApiOperation({ summary: 'Remover colaborador da viagem', description: 'So o criador.' })
  @ApiNoContentResponse({ description: 'Colaborador removido' })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR, [CodigoErro.MEMBRO_NAO_ENCONTRADO])
  remover(
    @Param('viagemId') viagemId: string,
    @Param('membroId', ParseIdPipe) membroId: number,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<void> {
    return this.membrosService.remover(viagemId, membroId, usuario);
  }
}
