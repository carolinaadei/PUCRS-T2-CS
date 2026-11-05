import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { FiltroErros } from '../common/filters/filtro-erros.filter';
import { atribuirRequestId, registrarAcesso } from '../common/http/request-id';
import { criarPipeValidacao } from '../common/pipes/pipe-validacao';

/**
 * Tudo o que molda o comportamento HTTP da API. Usado pelo `main.ts`, pelos
 * testes e2e e pelo gerador do OpenAPI - assim os tres exercitam exatamente a
 * mesma configuracao, e nao copias que divergem com o tempo.
 */
export function configurarAplicacao(app: NestExpressApplication): void {
  const config = app.get(ConfigService);

  const trustProxy = config.get<boolean | number | string>('trustProxy');
  if (trustProxy !== undefined) {
    app.set('trust proxy', trustProxy);
  }

  app.use(atribuirRequestId);
  app.use(registrarAcesso);
  app.use(helmet());

  const origens = config.get<string[]>('corsOrigens')!;
  app.enableCors({
    // A autenticacao e por header (Bearer), nao por cookie: nao ha `credentials`,
    // e por isso "*" e aceitavel para quem quiser liberar tudo.
    origin: origens.includes('*') ? '*' : origens,
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.get<string>('prefixoApi')!);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(criarPipeValidacao());
  app.useGlobalFilters(new FiltroErros());
}
