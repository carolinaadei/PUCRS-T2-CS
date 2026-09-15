import { Module } from '@nestjs/common';
import { OrcamentoController } from './orcamento.controller';
import { OrcamentoService } from './orcamento.service';

@Module({
  controllers: [OrcamentoController],
  providers: [OrcamentoService],
  exports: [OrcamentoService],
})
export class OrcamentoModule {}
