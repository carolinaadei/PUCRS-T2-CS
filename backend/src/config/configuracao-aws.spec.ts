import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SSMClient } from '@aws-sdk/client-ssm';
import { carregarConfiguracaoDaAws } from './configuracao-aws';

const logger = { log: jest.fn() };

describe('carregarConfiguracaoDaAws', () => {
  let segredos: jest.SpyInstance;
  let parametros: jest.SpyInstance;

  beforeEach(() => {
    segredos = jest.spyOn(SecretsManagerClient.prototype, 'send');
    parametros = jest.spyOn(SSMClient.prototype, 'send');
  });

  afterEach(() => jest.restoreAllMocks());

  it('sem CONFIG_AWS_* nao chama a AWS', async () => {
    await carregarConfiguracaoDaAws({}, logger as never);

    expect(segredos).not.toHaveBeenCalled();
    expect(parametros).not.toHaveBeenCalled();
  });

  it('aplica cada segredo e parametro, sem sobrescrever o que ja veio do ambiente', async () => {
    segredos
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ JWT_SECRET: 'do-secrets' }),
      } as never)
      .mockResolvedValueOnce({
        SecretString: JSON.stringify({ RECUPERACAO_CODIGO_SECRET: 'r' }),
      } as never);
    parametros
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/viajajunto/dev/CORS_ORIGINS', Value: 'https://app.com' }],
        NextToken: 'pagina-2',
      } as never)
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/viajajunto/dev/PUBLIC_URL', Value: 'https://do-ssm' }],
      } as never);

    const ambiente: Record<string, string | undefined> = {
      CONFIG_AWS_SEGREDOS: 'viajajunto/dev/jwt, viajajunto/dev/recuperacao',
      CONFIG_AWS_PARAMETROS: '/viajajunto/dev/',
      PUBLIC_URL: 'https://definido-a-mao',
    };

    await carregarConfiguracaoDaAws(ambiente, logger as never);

    expect(ambiente).toMatchObject({
      JWT_SECRET: 'do-secrets',
      RECUPERACAO_CODIGO_SECRET: 'r',
      CORS_ORIGINS: 'https://app.com',
      PUBLIC_URL: 'https://definido-a-mao',
    });
    expect(parametros).toHaveBeenCalledTimes(2);
  });

  it('falha o boot dizendo o que nao foi lido (repetir e papel do SDK)', async () => {
    segredos.mockRejectedValue(new Error('ResourceNotFound'));

    await expect(
      carregarConfiguracaoDaAws({ CONFIG_AWS_SEGREDOS: 'nao-existe' }, logger as never),
    ).rejects.toThrow('Nao foi possivel ler o segredo nao-existe: Error: ResourceNotFound');
    expect(segredos).toHaveBeenCalledTimes(1);
  });
});
