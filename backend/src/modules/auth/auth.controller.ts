import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaRecuperacaoDto } from './dto/resposta-recuperacao.dto';
import { RespostaVerificacaoDto } from './dto/resposta-verificacao.dto';
import { VerificarCodigoDto } from './dto/verificar-codigo.dto';

const MENSAGEM_GENERICA =
  'Se houver uma conta com este e-mail, enviaremos um codigo de verificacao.';
import { RespostaLogoutDto } from './dto/resposta-logout.dto';

/**
 * Controller responsavel pelos endpoints de autenticacao de usuarios (RF01 e RF02).
 */
@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * RF01 - Cadastra uma nova conta de usuario com senha em hash.
   * @param dto Dados cadastrais do usuario.
   */
  @Publico()
  @Post('registrar')
  @ApiOperation({ summary: 'RF01 - Cadastrar conta' })
  @ApiResponse({ status: 201, type: RespostaAutenticacaoDto })
  @ApiResponse({ status: 400, description: 'Dados invalidos' })
  @ApiResponse({ status: 409, description: 'E-mail ja cadastrado' })
  registrar(@Body() dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.registrar(dto);
  }

  /**
   * RF02 - Autentica as credenciais do usuario e retorna o token de acesso.
   * @param dto Credenciais de acesso (e-mail e senha).
   */
  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF02 - Autenticar usuario' })
  @ApiResponse({ status: 200, type: RespostaAutenticacaoDto })
  @ApiResponse({ status: 400, description: 'Dados invalidos' })
  @ApiResponse({ status: 401, description: 'Credenciais invalidas' })
  login(@Body() dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.login(dto);
  }

  @Publico()
  // Limite baixo: envio de e-mail e alvo de abuso (spam e enumeracao de contas).
  // A chave nomeia o throttler do ThrottlerModule que esta sendo sobrescrito;
  // um nome inexistente e ignorado em silencio e a rota fica no limite padrao.
  @Throttle({ global: { limit: 3, ttl: 900_000 } })
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF03 (1/3) - Enviar codigo de 6 digitos por e-mail' })
  @ApiResponse({ status: 200, type: RespostaRecuperacaoDto })
  @ApiResponse({ status: 429, description: 'Muitas tentativas; tente mais tarde' })
  recuperarSenha(@Body() dto: RecuperarSenhaDto): RespostaRecuperacaoDto {
    // Sem await de proposito: o service dispara o envio e retorna na hora
    // (ver solicitarRecuperacaoSenha), para o tempo nao revelar o e-mail.
    this.authService.solicitarRecuperacaoSenha(dto.email);
    return { mensagem: MENSAGEM_GENERICA };
  }

  @Publico()
  // O teto por codigo (MAX_TENTATIVAS) e a defesa principal; este limite apenas
  // encarece a forca bruta distribuida.
  @Throttle({ global: { limit: 10, ttl: 900_000 } })
  @Post('verificar-codigo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF03 (2/3) - Conferir o codigo e liberar a troca' })
  @ApiResponse({ status: 200, type: RespostaVerificacaoDto })
  @ApiResponse({ status: 400, description: 'Codigo invalido ou expirado' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas; tente mais tarde' })
  verificarCodigo(@Body() dto: VerificarCodigoDto): Promise<RespostaVerificacaoDto> {
    return this.authService.verificarCodigo(dto.email, dto.codigo);
  }

  @Publico()
  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF03 (3/3) - Gravar a nova senha' })
  @ApiResponse({ status: 200, description: 'Senha redefinida' })
  @ApiResponse({ status: 400, description: 'Sessao invalida ou senhas divergentes' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas; tente mais tarde' })
  async redefinirSenha(@Body() dto: RedefinirSenhaDto): Promise<{ mensagem: string }> {
    await this.authService.redefinirSenha(dto.tokenTroca, dto.novaSenha, dto.confirmarNovaSenha);
    return { mensagem: 'Senha redefinida com sucesso' };
  /**
   * RF02 - Encerra a sessao do usuario autenticado (logout).
   * @param usuario Dados do usuario autenticado extraidos do token JWT.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'RF02 - Encerrar sessao do usuario (logout)' })
  @ApiResponse({ status: 200, type: RespostaLogoutDto })
  @ApiResponse({ status: 401, description: 'Token nao fornecido ou invalido' })
  logout(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<RespostaLogoutDto> {
    return this.authService.logout(usuario.id);
  }
}

