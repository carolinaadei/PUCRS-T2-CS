import { ConsoleLogger } from '@nestjs/common';

/**
 * Em producao o log sai em JSON (uma linha por evento, pronta para CloudWatch
 * ou qualquer agregador) e sem o nivel debug - e nele que sai o codigo de
 * recuperacao de senha, atalho apenas de desenvolvimento.
 */
export const criarLogger = () => {
  const emProducao = process.env.NODE_ENV === 'production';

  return new ConsoleLogger({
    json: emProducao,
    logLevels: emProducao ? ['log', 'warn', 'error', 'fatal'] : undefined,
  });
};
