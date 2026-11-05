import { Module } from '@nestjs/common';
import { OrcamentoModule } from '../orcamento/orcamento.module';
import { AtividadesCatalogoController } from './atividades-catalogo.controller';
import { AtividadesViagemController } from './atividades-viagem.controller';
import { AtividadesService } from './atividades.service';

@Module({
  imports: [OrcamentoModule],
  controllers: [AtividadesCatalogoController, AtividadesViagemController],
  providers: [AtividadesService],
  exports: [AtividadesService],
})
export class AtividadesModule {}
