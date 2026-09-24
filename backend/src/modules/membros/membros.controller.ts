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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { NivelAcesso, NivelAcessoViagem } from '../../common/decorators/nivel-acesso.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { AcessoViagemGuard } from '../../common/guards/acesso-viagem.guard';
import {
  ApiAcessoViagem,
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
  ApiParamViagem,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { DefinirPermissaoDto } from './dto/definir-permissao.dto';
import { MembroDto } from './dto/membro-resposta.dto';
import { MembrosService } from './membros.service';

const ApiParamMembro = () =>
  ApiParam({
    name: 'membroId',
    description: 'Id do vinculo (campo `id` do colaborador), nao o do usuario',
    example: 3,
  });

@ApiTags('Colaboracao')
@ApiAutenticado()
@Controller('viagens/:viagemId/membros')
@UseGuards(AcessoViagemGuard)
@ApiParamViagem()
export class MembrosController {
  constructor(private readonly membrosService: MembrosService) {}

  // Sem @NivelAcesso: quem entra ainda nao e membro. O proprio codigo da viagem
  // funciona como convite (RF18).
  @Post('entrar')
  @ApiOperation({
    summary: 'RF18 - Entrar na viagem pelo codigo de convite',
    description: 'O codigo da viagem e o convite. Quem entra comeca como VISUALIZADOR.',
  })
  @ApiCreatedResponse({ type: MembroDto })
  @ApiErro(404, 'Codigo de convite invalido')
  @ApiErro(409, 'Usuario ja participa ou e o criador', 'Voce ja participa desta viagem')
  entrar(@Param('viagemId') viagemId: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.membrosService.entrar(viagemId, usuario.id);
  }

  @Get()
  @NivelAcesso(NivelAcessoViagem.MEMBRO)
  @ApiOperation({
    summary: 'Listar colaboradores da viagem',
    description: 'Por ordem de entrada. O criador nao aparece nesta lista.',
  })
  @ApiOkResponse({ type: [MembroDto] })
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  listar(@Param('viagemId') viagemId: string) {
    return this.membrosService.listar(viagemId);
  }

  @Patch(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @ApiParamMembro()
  @ApiOperation({
    summary: 'RF20, RN04 - Alterar permissao de um colaborador',
    description: 'Alterna entre EDITOR e VISUALIZADOR. So o criador.',
  })
  @ApiOkResponse({ type: MembroDto })
  @ApiErroValidacao('permissao must be one of the following values: EDITOR, VISUALIZADOR')
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR, 'colaborador nao encontrado nesta viagem')
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
  @ApiOperation({
    summary: 'Sair da viagem',
    description: 'O colaborador deixa a viagem. O criador nao sai: ele exclui a viagem.',
  })
  @ApiNoContentResponse({ description: 'Voce saiu da viagem' })
  @ApiErro(
    400,
    'O criador tentou sair da propria viagem',
    'O criador da viagem nao pode sair dela; exclua a viagem',
  )
  @ApiAcessoViagem(NivelAcessoViagem.MEMBRO)
  sair(@Param('viagemId') viagemId: string, @UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.membrosService.sair(viagemId, usuario.id);
  }

  @Delete(':membroId')
  @NivelAcesso(NivelAcessoViagem.CRIADOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParamMembro()
  @ApiOperation({
    summary: 'RF20, RN04 - Remover colaborador da viagem',
    description: 'So o criador.',
  })
  @ApiNoContentResponse({ description: 'Colaborador removido' })
  @ApiAcessoViagem(NivelAcessoViagem.CRIADOR, 'colaborador nao encontrado nesta viagem')
  remover(@Param('viagemId') viagemId: string, @Param('membroId', ParseIntPipe) membroId: number) {
    return this.membrosService.remover(viagemId, membroId);
  }
}
