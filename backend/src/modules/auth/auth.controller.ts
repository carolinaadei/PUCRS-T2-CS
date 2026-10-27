import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Publico } from '../../common/decorators/publico.decorator';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import {
  ApiAutenticado,
  ApiErro,
  ApiErroValidacao,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaLogoutDto } from './dto/resposta-logout.dto';
import { RespostaRecuperacaoDto } from './dto/resposta-recuperacao.dto';
import { RespostaRedefinicaoDto } from './dto/resposta-redefinicao.dto';
import { RespostaVerificacaoDto } from './dto/resposta-verificacao.dto';
import { VerificarCodigoDto } from './dto/verificar-codigo.dto';

const MENSAGEM_GENERICA =
  'Se houver uma conta com este e-mail, enviaremos um codigo de verificacao.';

const MUITAS_TENTATIVAS = 'Muitas tentativas; tente mais tarde';

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
  @ApiOperation({
    summary: 'RF01 - Cadastrar conta',
    description: 'Cria a conta e ja devolve o token de acesso.',
  })
  @ApiCreatedResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('Informe um e-mail valido', 'A senha deve ter no minimo 8 caracteres')
  @ApiErro(409, 'E-mail ja cadastrado', 'Ja existe uma conta com este e-mail')
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
  @ApiOperation({
    summary: 'RF02 - Autenticar usuario',
    description: 'Devolve o JWT a enviar no header `Authorization: Bearer <token>`.',
  })
  @ApiOkResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('Formato de e-mail invalido', 'A senha e obrigatoria')
  @ApiErro(401, 'Credenciais invalidas', 'E-mail ou senha invalidos')
  login(@Body() dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.login(dto);
  }

  /**
   * RF02 - Encerra as sessoes do usuario autenticado (logout).
   * @param usuario Usuario resolvido pela JwtStrategy a partir do token.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiAutenticado()
  @ApiOperation({
    summary: 'RF02 - Encerrar sessoes',
    description:
      'Invalida todos os JWTs ja emitidos para o usuario: os tokens anteriores ' +
      'passam a receber 401, inclusive em outros dispositivos.',
  })
  @ApiOkResponse({ type: RespostaLogoutDto })
  logout(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<RespostaLogoutDto> {
    return this.authService.logout(usuario.id);
  }

  @Publico()
  // Limite baixo: envio de e-mail e alvo de abuso (spam e enumeracao de contas).
  // A chave nomeia o throttler do ThrottlerModule que esta sendo sobrescrito;
  // um nome inexistente e ignorado em silencio e a rota fica no limite padrao.
  @Throttle({ global: { limit: 3, ttl: 900_000 } })
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'RF03 (1/3) - Enviar codigo de 6 digitos por e-mail',
    description:
      'Resposta sempre igual, exista a conta ou nao. Codigo valido por 15 min. ' +
      'Limite: 3 pedidos a cada 15 min por IP.',
  })
  @ApiOkResponse({ type: RespostaRecuperacaoDto })
  @ApiErroValidacao('Informe um e-mail valido')
  @ApiErro(429, MUITAS_TENTATIVAS, 'ThrottlerException: Too Many Requests')
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
  @ApiOperation({
    summary: 'RF03 (2/3) - Conferir o codigo e liberar a troca',
    description:
      'Devolve o `tokenTroca`, valido por 10 min. Cada codigo aceita 5 tentativas. ' +
      'Limite: 10 pedidos a cada 15 min por IP.',
  })
  @ApiOkResponse({ type: RespostaVerificacaoDto })
  @ApiErro(400, 'Codigo invalido, expirado ou ja usado', 'Codigo invalido ou expirado')
  @ApiErro(429, MUITAS_TENTATIVAS, 'ThrottlerException: Too Many Requests')
  verificarCodigo(@Body() dto: VerificarCodigoDto): Promise<RespostaVerificacaoDto> {
    return this.authService.verificarCodigo(dto.email, dto.codigo);
  }

  @Publico()
  @Throttle({ global: { limit: 5, ttl: 900_000 } })
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'RF03 (3/3) - Gravar a nova senha',
    description:
      'Troca a senha e encerra as sessoes abertas: JWTs emitidos antes passam a ' +
      'receber 401. Limite: 5 pedidos a cada 15 min por IP.',
  })
  @ApiOkResponse({ type: RespostaRedefinicaoDto })
  @ApiErro(
    400,
    'Token de troca invalido, usado ou expirado, ou senhas divergentes',
    'Sessao de redefinicao invalida ou expirada',
  )
  @ApiErro(429, MUITAS_TENTATIVAS, 'ThrottlerException: Too Many Requests')
  async redefinirSenha(@Body() dto: RedefinirSenhaDto): Promise<RespostaRedefinicaoDto> {
    await this.authService.redefinirSenha(dto.tokenTroca, dto.novaSenha, dto.confirmarNovaSenha);
    return { mensagem: 'Senha redefinida com sucesso' };
  }
}
