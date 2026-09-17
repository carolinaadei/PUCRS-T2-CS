import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LogInterceptor } from './common/interceptors/log.interceptor';
import { configuracao } from './config/configuracao';
import { validarEnv } from './config/validacao-env';
import { AtividadesModule } from './modules/atividades/atividades.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvaliacoesModule } from './modules/avaliacoes/avaliacoes.module';
import { DestinosModule } from './modules/destinos/destinos.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { MembrosModule } from './modules/membros/membros.module';
import { OrcamentoModule } from './modules/orcamento/orcamento.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';
import { ViagensModule } from './modules/viagens/viagens.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuracao],
      validate: validarEnv,
    }),
    PrismaModule,
    MailModule,

    // Teto global; rotas sensiveis apertam o limite com @Throttle (ver AuthController).
    ThrottlerModule.forRoot([{ name: 'global', limit: 100, ttl: 60_000 }]),

    // Modulos de dominio (ver Documento de Requisitos, Secao 3)
    AuthModule, // Modulo 1 - Autenticacao e Perfil
    UsuariosModule, // Modulo 1 - Autenticacao e Perfil
    ViagensModule, // Modulo 2 - Gestao de Viagens
    DestinosModule, // Modulo 3 - Destinos
    AtividadesModule, // Modulo 4 - Atividades
    OrcamentoModule, // Modulo 5 - Orcamento
    MembrosModule, // Modulo 6 - Colaboracao
    AvaliacoesModule, // Modulo 7 - Avaliacao e Descoberta
    HealthModule,
  ],
  providers: [
    // Rate limit antes da autenticacao: protege tambem as rotas publicas.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Autenticacao exigida por padrao; use @Publico() para abrir uma rota (RN01).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LogInterceptor },
  ],
})
export class AppModule {}
