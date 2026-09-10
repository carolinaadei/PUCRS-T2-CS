import { Module } from '@nestjs/common';
import { MembrosController } from './membros.controller';
import { MembrosService } from './membros.service';

// TODO (RF21 - prioridade Media): notificacoes in-app para colaboradores quando
// houver alteracoes relevantes na viagem. Avaliar um NotificacoesModule com
// tabela propria + EventEmitter do Nest.
@Module({
  controllers: [MembrosController],
  providers: [MembrosService],
  exports: [MembrosService],
})
export class MembrosModule {}
