import { Module } from '@nestjs/common';
import { OrcamentoModule } from '../orcamento/orcamento.module';
import { AtividadesCatalogoController } from './atividades-catalogo.controller';
import { AtividadesViagemController } from './atividades-viagem.controller';
import { AtividadesService } from './atividades.service';

// TODO: integrar a Google Places API (Servico de Locais/Atividades, Secao 2 da
// arquitetura) para popular o catalogo a partir de `google_place_id`.
@Module({
  imports: [OrcamentoModule],
  controllers: [AtividadesCatalogoController, AtividadesViagemController],
  providers: [AtividadesService],
  exports: [AtividadesService],
})
export class AtividadesModule {}
