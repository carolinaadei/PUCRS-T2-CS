import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Publico } from '../../common/decorators/publico.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';

@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Post('registrar')
  @ApiOperation({ summary: 'RF01 - Cadastrar conta' })
  @ApiResponse({ status: 201, type: RespostaAutenticacaoDto })
  @ApiResponse({ status: 400, description: 'Dados invalidos' })
  @ApiResponse({ status: 409, description: 'E-mail ja cadastrado' })
  registrar(@Body() dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.registrar(dto);
  }

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
}
