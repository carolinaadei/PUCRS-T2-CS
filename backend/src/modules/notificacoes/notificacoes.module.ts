import { Module } from '@nestjs/common';
import { NotificacoesController } from './notificacoes.controller';

// TODO (RF21 - prioridade Media): notificacoes in-app para colaboradores quando
// houver alteracoes relevantes na viagem. O contrato ja esta no controller;
// falta a tabela propria e a emissao dos eventos (avaliar o EventEmitter do Nest).
@Module({
  controllers: [NotificacoesController],
})
export class NotificacoesModule {}
