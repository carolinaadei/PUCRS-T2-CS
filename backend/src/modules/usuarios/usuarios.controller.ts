import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { CodigoErro } from '../../common/erros/codigos-erro';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AuthService } from '../auth/auth.service';
import { RespostaAutenticacaoDto } from '../auth/dto/resposta-autenticacao.dto';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { ExcluirContaDto, TrocarSenhaDto } from './dto/conta.dto';
import { PaisVisitadoDto, PerfilDto } from './dto/perfil.dto';
import { UsuariosService } from './usuarios.service';

const ApiSenhaIncorreta = () =>
  ApiErro(400, CodigoErro.SENHA_ATUAL_INCORRETA, 'A senha informada nao confere');

@ApiTags('Usuarios')
@ApiAutenticado()
@Controller('usuarios/eu')
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Ver o meu perfil', description: 'Dados do dono do token.' })
  @ApiOkResponse({ type: PerfilDto })
  perfil(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<PerfilDto> {
    return this.usuariosService.buscarPorId(usuario.id);
  }

  @Patch()
  @ApiOperation({
    summary: 'Atualizar o meu perfil',
    description: 'Por enquanto, apenas o nome pode ser alterado.',
  })
  @ApiOkResponse({ type: PerfilDto })
  @ApiErroValidacao('O nome deve ter no minimo 2 caracteres')
  atualizar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: AtualizarPerfilDto,
  ): Promise<PerfilDto> {
    return this.usuariosService.atualizarPerfil(usuario.id, dto);
  }

  @Get('paises-visitados')
  @ApiOperation({
    summary: 'Paises que ja visitei',
    description:
      'Paises dos destinos das viagens CONCLUIDAS de que voce participou, com o codigo ISO ' +
      '3166-1 alfa-2 que o mapa (jsVectormap) usa como chave.',
  })
  @ApiOkResponse({ type: [PaisVisitadoDto] })
  paisesVisitados(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<PaisVisitadoDto[]> {
    return this.usuariosService.listarPaisesVisitados(usuario.id);
  }

  @Throttle({ global: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Put('senha')
  @ApiOperation({
    summary: 'Trocar a minha senha',
    description:
      'Exige a senha atual. Encerra as sessoes de todos os dispositivos e devolve um par de ' +
      'tokens novo para este continuar logado.',
  })
  @ApiOkResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('A nova senha deve ter no minimo 8 caracteres')
  @ApiErro(
    400,
    [CodigoErro.SENHA_ATUAL_INCORRETA, CodigoErro.SENHAS_DIVERGENTES],
    'Senha atual errada ou confirmacao diferente da nova senha',
  )
  trocarSenha(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: TrocarSenhaDto,
  ): Promise<RespostaAutenticacaoDto> {
    return this.authService.trocarSenha(
      usuario.id,
      dto.senhaAtual,
      dto.novaSenha,
      dto.confirmarNovaSenha,
    );
  }

  @Delete('sessoes')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sair de todos os dispositivos',
    description:
      'Revoga todos os refresh tokens e invalida na hora os access tokens ja emitidos, ' +
      'inclusive o usado nesta chamada.',
  })
  @ApiNoContentResponse({ description: 'Todas as sessoes encerradas' })
  encerrarSessoes(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<void> {
    return this.authService.encerrarTodasAsSessoes(usuario.id);
  }

  @Throttle({ global: { limit: 5, ttl: 15 * 60 * 1000 } })
  @Post('exclusao')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir a minha conta',
    description:
      'Exige a senha. Apaga a conta, as viagens que voce criou (com tudo dentro), suas ' +
      'participacoes e avaliacoes. Itens que voce cadastrou no catalogo ficam, sem autor. ' +
      'Irreversivel.',
  })
  @ApiNoContentResponse({ description: 'Conta excluida' })
  @ApiErroValidacao('Informe a sua senha para confirmar')
  @ApiSenhaIncorreta()
  excluirConta(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body() dto: ExcluirContaDto,
  ): Promise<void> {
    return this.usuariosService.excluirConta(usuario.id, dto.senha);
  }
}
