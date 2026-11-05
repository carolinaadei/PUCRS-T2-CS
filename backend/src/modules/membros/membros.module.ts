import { Module } from '@nestjs/common';
import {
  ConvitesController,
  ConviteViagemController,
  MembrosController,
} from './membros.controller';
import { MembrosService } from './membros.service';

@Module({
  controllers: [ConvitesController, ConviteViagemController, MembrosController],
  providers: [MembrosService],
  exports: [MembrosService],
})
export class MembrosModule {}
