import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { MembrosController } from './membros.controller';
import { MembrosService } from './membros.service';

@Module({
  imports: [NotificacoesModule],
  controllers: [MembrosController],
  providers: [MembrosService],
  exports: [MembrosService],
})
export class MembrosModule {}
