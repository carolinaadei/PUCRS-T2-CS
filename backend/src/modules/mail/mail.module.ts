import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { PROVEDOR_EMAIL } from './mensagem-email';
import { criarProvedorEmail } from './provedores';

@Global()
@Module({
  providers: [
    MailService,
    { provide: PROVEDOR_EMAIL, inject: [ConfigService], useFactory: criarProvedorEmail },
  ],
  exports: [MailService, PROVEDOR_EMAIL],
})
export class MailModule {}
