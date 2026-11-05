import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Publico } from '../../common/decorators/publico.decorator';
import { MensagemDto } from '../../common/dto/mensagem.dto';
import { CodigoErro } from '../../common/erros/codigos-erro';
import { ApiErro, ApiErroValidacao } from '../../common/swagger/api-respostas.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RecuperarSenhaDto } from './dto/recuperar-senha.dto';
import { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegistrarDto } from './dto/registrar.dto';
import { RespostaAutenticacaoDto } from './dto/resposta-autenticacao.dto';
import { RespostaVerificacaoDto } from './dto/resposta-verificacao.dto';
import { VerificarCodigoDto } from './dto/verificar-codigo.dto';

const QUINZE_MINUTOS = 15 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;

const ApiLimite = () =>
  ApiErro(429, CodigoErro.MUITAS_REQUISICOES, 'Muitas tentativas; aguarde e tente de novo');

// A chave dos @Throttle nomeia o throttler do ThrottlerModule que esta sendo
// sobrescrito; um nome inexistente e ignorado em silencio e a rota fica no padrao.
@ApiTags('Autenticacao')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Publico()
  @Throttle({ global: { limit: 10, ttl: UMA_HORA } })
  @Post('registrar')
  @ApiOperation({
    summary: 'Cadastrar conta',
    description: 'Cria a conta e ja abre uma sessao. Limite: 10 cadastros por hora por IP.',
  })
  @ApiCreatedResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('Informe um e-mail valido', 'A senha deve ter no minimo 8 caracteres')
  @ApiErro(409, CodigoErro.EMAIL_JA_CADASTRADO, 'Ja existe uma conta com este e-mail')
  @ApiLimite()
  registrar(@Body() dto: RegistrarDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.registrar(dto);
  }

  @Publico()
  // Limite proprio: o teto global (100/min) deixaria tentar 6 mil senhas por hora.
  @Throttle({ global: { limit: 10, ttl: QUINZE_MINUTOS } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Entrar',
    description:
      'Devolve o accessToken (curto) e o refreshToken (longo). Limite: 10 tentativas a cada ' +
      '15 min por IP.',
  })
  @ApiOkResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('Informe um e-mail valido', 'A senha e obrigatoria')
  @ApiErro(401, CodigoErro.CREDENCIAIS_INVALIDAS, 'E-mail ou senha invalidos')
  @ApiLimite()
  login(@Body() dto: LoginDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.login(dto);
  }

  @Publico()
  @Throttle({ global: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar a sessao',
    description:
      'Troca o refreshToken por um par novo. O token enviado deixa de valer; reenviar um token ' +
      'ja trocado e tratado como roubo e encerra todas as sessoes da conta.',
  })
  @ApiOkResponse({ type: RespostaAutenticacaoDto })
  @ApiErroValidacao('Informe o refreshToken')
  @ApiErro(401, CodigoErro.REFRESH_TOKEN_INVALIDO, 'Refresh token invalido, expirado ou ja usado')
  @ApiLimite()
  renovar(@Body() dto: RefreshTokenDto): Promise<RespostaAutenticacaoDto> {
    return this.authService.renovar(dto.refreshToken);
  }

  // Publico: o refreshToken e a credencial revogada, e o accessToken pode ja ter expirado.
  @Publico()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sair deste dispositivo',
    description:
      'Revoga o refreshToken informado; nao exige o accessToken, que expira sozinho em ' +
      'minutos. Responde 204 tambem para token que ja nao valia. Para derrubar todos os ' +
      'dispositivos na hora, use DELETE /usuarios/eu/sessoes.',
  })
  @ApiNoContentResponse({ description: 'Sessao encerrada' })
  @ApiErroValidacao('Informe o refreshToken')
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  @Publico()
  // Limite baixo: envio de e-mail e alvo de abuso (spam e enumeracao de contas).
  @Throttle({ global: { limit: 3, ttl: QUINZE_MINUTOS } })
  @Post('recuperar-senha')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Recuperar senha (1/3) - Enviar codigo de 6 digitos por e-mail',
    description:
      'Resposta sempre igual, exista a conta ou nao. Codigo valido por 15 min. ' +
      'Limite: 3 pedidos a cada 15 min por IP.',
  })
  @ApiAcceptedResponse({ type: MensagemDto })
  @ApiErroValidacao('Informe um e-mail valido')
  @ApiLimite()
  recuperarSenha(@Body() dto: RecuperarSenhaDto): MensagemDto {
    // Sem await de proposito: o service dispara o envio e retorna na hora,
    // para o tempo de resposta nao revelar se o e-mail existe.
    this.authService.solicitarRecuperacaoSenha(dto.email);
    return {
      mensagem: 'Se houver uma conta com este e-mail, enviaremos um codigo de verificacao.',
    };
  }

  @Publico()
  // O teto por codigo (5 tentativas) e a defesa principal; este limite apenas
  // encarece a forca bruta distribuida.
  @Throttle({ global: { limit: 10, ttl: QUINZE_MINUTOS } })
  @Post('verificar-codigo')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recuperar senha (2/3) - Conferir o codigo e liberar a troca',
    description:
      'Devolve o `tokenTroca`, valido por 10 min. Cada codigo aceita 5 tentativas. ' +
      'Limite: 10 pedidos a cada 15 min por IP.',
  })
  @ApiOkResponse({ type: RespostaVerificacaoDto })
  @ApiErroValidacao('O codigo deve ter exatamente 6 digitos')
  @ApiErro(400, CodigoErro.CODIGO_RECUPERACAO_INVALIDO, 'Codigo invalido ou expirado')
  @ApiLimite()
  verificarCodigo(@Body() dto: VerificarCodigoDto): Promise<RespostaVerificacaoDto> {
    return this.authService.verificarCodigo(dto.email, dto.codigo);
  }

  @Publico()
  @Throttle({ global: { limit: 5, ttl: QUINZE_MINUTOS } })
  @Post('redefinir-senha')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recuperar senha (3/3) - Gravar a nova senha',
    description:
      'Troca a senha e encerra todas as sessoes abertas. Limite: 5 pedidos a cada 15 min por IP.',
  })
  @ApiOkResponse({ type: MensagemDto })
  @ApiErroValidacao('A senha deve ter no minimo 8 caracteres')
  @ApiErro(
    400,
    [CodigoErro.TOKEN_TROCA_INVALIDO, CodigoErro.SENHAS_DIVERGENTES],
    'Token de troca invalido, usado ou expirado, ou confirmacao diferente da senha',
  )
  @ApiLimite()
  async redefinirSenha(@Body() dto: RedefinirSenhaDto): Promise<MensagemDto> {
    await this.authService.redefinirSenha(dto.tokenTroca, dto.novaSenha, dto.confirmarNovaSenha);
    return { mensagem: 'Senha redefinida com sucesso' };
  }
}
