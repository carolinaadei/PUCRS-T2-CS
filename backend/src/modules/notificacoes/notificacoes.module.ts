import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesInterceptor } from './notificacoes.interceptor';
import { NotificacoesService } from './notificacoes.service';

@Module({
  controllers: [NotificacoesController],
  providers: [
    NotificacoesService,
    {
      provide: APP_INTERCEPTOR,
      useClass: NotificacoesInterceptor,
    },
  ],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
