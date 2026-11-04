import { Module } from '@nestjs/common';
import { OrcamentoModule } from '../orcamento/orcamento.module';
import { AtividadesCatalogoController } from './atividades-catalogo.controller';
import { AtividadesViagemController } from './atividades-viagem.controller';
import { AtividadesService } from './atividades.service';

// Pendente: importar locais da Google Places API para o catalogo, preenchendo
// `google_place_id` e `fonte = 'google_places'` (Secao 2 da arquitetura).
@Module({
  imports: [OrcamentoModule],
  controllers: [AtividadesCatalogoController, AtividadesViagemController],
  providers: [AtividadesService],
  exports: [AtividadesService],
})
export class AtividadesModule {}
