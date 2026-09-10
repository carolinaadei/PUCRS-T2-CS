import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsuarioAtual } from '../../common/decorators/usuario-atual.decorator';
import { UsuarioAutenticado } from '../../common/types/usuario-autenticado';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuarios')
@ApiBearerAuth()
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('eu')
  @ApiOperation({ summary: 'Dados do usuario autenticado' })
  perfil(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.usuariosService.buscarPorId(usuario.id);
  }

  @Patch('eu')
  @ApiOperation({ summary: 'Atualizar o proprio perfil' })
  atualizar(@UsuarioAtual() usuario: UsuarioAutenticado, @Body() dto: AtualizarPerfilDto) {
    return this.usuariosService.atualizarPerfil(usuario.id, dto);
  }
}
