import { Body, Controller, Get, NotImplementedException, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import {
  ApiAutenticado,
  ApiErroValidacao,
  ApiNaoImplementado,
} from '../../common/swagger/api-respostas.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { PaisVisitadoDto, PerfilDto } from './dto/perfil.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuarios')
@ApiAutenticado()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('eu')
  @ApiOperation({
    summary: 'Dados do usuario autenticado',
    description: 'Perfil do dono do token.',
  })
  @ApiOkResponse({ type: PerfilDto })
  perfil(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.usuariosService.buscarPorId(usuario.id);
  }

  @Patch('eu')
  @ApiOperation({
    summary: 'Atualizar o proprio perfil',
    description: 'Por enquanto, apenas o nome pode ser alterado.',
  })
  @ApiOkResponse({ type: PerfilDto })
  @ApiErroValidacao('nome must be longer than or equal to 2 characters')
  atualizar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: AtualizarPerfilDto) {
    return this.usuariosService.atualizarPerfil(usuario.id, dto);
  }

  @Get('eu/paises-visitados')
  @ApiOperation({
    summary: 'RF11 - Paises visitados (nao implementado)',
    description:
      'Paises dos destinos das viagens concluidas do usuario, para o mapa (jsVectormap).',
  })
  @ApiOkResponse({ type: [PaisVisitadoDto] })
  @ApiNaoImplementado()
  paisesVisitados(): never {
    // TODO (RF11 - prioridade Media): paises de `destino_catalogo` nas viagens
    // CONCLUIDAS em que o usuario e criador ou membro, convertidos para ISO alfa-2.
    throw new NotImplementedException('RF11 ainda nao implementado');
  }
}
