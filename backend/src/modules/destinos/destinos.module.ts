import { Module } from '@nestjs/common';
import { DestinosCatalogoController } from './destinos-catalogo.controller';
import { DestinosViagemController } from './destinos-viagem.controller';
import { DestinosService } from './destinos.service';

@Module({
  controllers: [DestinosCatalogoController, DestinosViagemController],
  providers: [DestinosService],
  exports: [DestinosService],
})
export class DestinosModule {}
