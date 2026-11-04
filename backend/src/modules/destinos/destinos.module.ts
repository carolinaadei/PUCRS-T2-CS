import { Module } from '@nestjs/common';
import { OrcamentoModule } from '../orcamento/orcamento.module';
import { DestinosCatalogoController } from './destinos-catalogo.controller';
import { DestinosViagemController } from './destinos-viagem.controller';
import { DestinosService } from './destinos.service';

@Module({
  imports: [OrcamentoModule],
  // O catalogo vem primeiro: `GET /destinos/destaques` precisa ser registrado
  // antes de `GET /destinos/:id`, que o capturaria.
  controllers: [DestinosCatalogoController, DestinosViagemController],
  providers: [DestinosService],
  exports: [DestinosService],
})
export class DestinosModule {}
