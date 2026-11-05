import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AwsModule } from './aws/aws.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { configuracao } from './config/configuracao';
import { validarEnv } from './config/validacao-env';
import { AtividadesModule } from './modules/atividades/atividades.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvaliacoesModule } from './modules/avaliacoes/avaliacoes.module';
import { DestinosModule } from './modules/destinos/destinos.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { MembrosModule } from './modules/membros/membros.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { OrcamentoModule } from './modules/orcamento/orcamento.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { ViagensModule } from './modules/viagens/viagens.module';
import { PrismaModule } from './prisma/prisma.module';
import { GeoapifyModule } from './geoapify/geoapify.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'test',
      load: [configuracao],
      validate: validarEnv,
    }),
    PrismaModule,
    GeoapifyModule,
    AwsModule,
    MailModule,
    NotificacoesModule,

    // Teto global por IP; rotas sensiveis apertam o limite com @Throttle. O
    // contador fica em memoria: com mais de uma instancia, troque por um storage
    // compartilhado (Redis) para o limite valer no conjunto.
    ThrottlerModule.forRoot([{ name: 'global', limit: 100, ttl: 60_000 }]),

    AuthModule,
    UsuariosModule,
    ViagensModule,
    DestinosModule,
    AtividadesModule,
    OrcamentoModule,
    MembrosModule,
    AvaliacoesModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [
    // Rate limit antes da autenticacao: protege tambem as rotas publicas.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Autenticacao exigida por padrao; use @Publico() para abrir uma rota.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
