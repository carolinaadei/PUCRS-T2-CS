import { Module } from '@nestjs/common';
import { DestinosCatalogoController } from './destinos-catalogo.controller';
import { DestinosViagemController } from './destinos-viagem.controller';
import { DestinosService } from './destinos.service';

// TODO (RF11 - prioridade Media): endpoint com os paises ja visitados pelo usuario
// para alimentar o mapa (jsVectormap) no frontend.
@Module({
  controllers: [DestinosCatalogoController, DestinosViagemController],
  providers: [DestinosService],
  exports: [DestinosService],
})
export class DestinosModule {}
