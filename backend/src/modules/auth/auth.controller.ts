import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Publico } from '../../common/decorators/publico.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaRecuperacaoDto } from './dto/resposta-recuperacao.dto';

const MENSAGEM_GENERICA =
  'Se houver uma conta com este e-mail, enviaremos as instrucoes de redefinicao.';

@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Post('registrar')
  @ApiOperation({ summary: 'RF01 - Cadastrar conta' })
  @ApiResponse({ status: 201, type: RespostaAutenticacaoDto })
  @ApiResponse({ status: 409, description: 'E-mail ja cadastrado' })
  registrar(@Body() dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.registrar(dto);
  }

  @Publico()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF02 - Autenticar usuario' })
  @ApiResponse({ status: 200, type: RespostaAutenticacaoDto })
  @ApiResponse({ status: 401, description: 'Credenciais invalidas' })
  login(@Body() dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.login(dto);
  }

  @Publico()
  // Limite baixo: envio de e-mail e alvo de abuso (spam e enumeracao de contas).
  @Throttle({ recuperacaoSenha: { limit: 3, ttl: 900_000 } })
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF03 - Solicitar redefinicao de senha por e-mail' })
  @ApiResponse({ status: 200, type: RespostaRecuperacaoDto })
  @ApiResponse({ status: 429, description: 'Muitas tentativas; tente mais tarde' })
  async recuperarSenha(@Body() dto: RecuperarSenhaDto): Promise<RespostaRecuperacaoDto> {
    await this.authService.solicitarRecuperacaoSenha(dto.email);
    return { mensagem: MENSAGEM_GENERICA };
  }

  @Publico()
  @Throttle({ recuperacaoSenha: { limit: 5, ttl: 900_000 } })
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'RF03 - Redefinir a senha com o token recebido' })
  @ApiResponse({ status: 200, description: 'Senha redefinida' })
  @ApiResponse({ status: 400, description: 'Token invalido ou expirado' })
  @ApiResponse({ status: 429, description: 'Muitas tentativas; tente mais tarde' })
  async redefinirSenha(@Body() dto: RedefinirSenhaDto): Promise<{ mensagem: string }> {
    await this.authService.redefinirSenha(dto.token, dto.novaSenha);
    return { mensagem: 'Senha redefinida com sucesso' };
  }
}
