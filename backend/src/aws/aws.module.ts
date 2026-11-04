import { Global, Module } from '@nestjs/common';
import { ArmazenamentoService } from './armazenamento.service';
import { FilaEmailsService } from './fila-emails.service';

/** Clientes dos servicos AWS usados pela API: S3 (fotos) e SQS (fila de e-mails). */
@Global()
@Module({
  providers: [ArmazenamentoService, FilaEmailsService],
  exports: [ArmazenamentoService, FilaEmailsService],
})
export class AwsModule {}
