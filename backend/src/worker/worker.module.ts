import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AwsModule } from '../aws/aws.module';
import { configuracao } from '../config/configuracao';
import { validarEnv } from '../config/validacao-env';
import { MailModule } from '../modules/mail/mail.module';
import { ConsumidorEmails } from './consumidor-emails';

/** O worker nao fala HTTP nem com o banco: so fila e provedor de e-mail. */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuracao], validate: validarEnv }),
    AwsModule,
    MailModule,
  ],
  providers: [ConsumidorEmails],
})
export class WorkerModule {}
