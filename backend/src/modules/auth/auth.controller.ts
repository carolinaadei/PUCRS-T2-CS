import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
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

