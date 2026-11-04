import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetParametersByPathCommand, Parameter, SSMClient } from '@aws-sdk/client-ssm';
import { Logger } from '@nestjs/common';

type Ambiente = Record<string, string | undefined>;

const TENTATIVAS = 5;

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/** O provisionamento pode terminar instantes antes de a API subir; tenta de novo antes de desistir. */
async function comRetentativas<T>(descricao: string, operacao: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await operacao();
    } catch (erro) {
      if (tentativa >= TENTATIVAS) {
        throw new Error(`Nao foi possivel ler ${descricao}: ${String(erro)}`);
      }
      await esperar(500 * 2 ** (tentativa - 1));
    }
  }
}

/** So preenche o que nao veio do ambiente: variavel definida explicitamente sempre vence. */
function aplicar(ambiente: Ambiente, valores: Record<string, unknown>): string[] {
  const aplicadas: string[] = [];

  for (const [nome, valor] of Object.entries(valores)) {
    if (typeof valor === 'string' && valor !== '' && !ambiente[nome]) {
      ambiente[nome] = valor;
      aplicadas.push(nome);
    }
  }

  return aplicadas;
}

async function lerParametros(cliente: SSMClient, caminho: string): Promise<Record<string, string>> {
  const valores: Record<string, string> = {};
  let proximo: string | undefined;

  do {
    const pagina = await cliente.send(
      new GetParametersByPathCommand({
        Path: caminho,
        Recursive: true,
        WithDecryption: true,
        NextToken: proximo,
      }),
    );

    for (const parametro of pagina.Parameters ?? ([] as Parameter[])) {
      const nome = parametro.Name?.split('/').pop();
      if (nome && parametro.Value !== undefined) {
        valores[nome] = parametro.Value;
      }
    }

    proximo = pagina.NextToken;
  } while (proximo);

  return valores;
}

/**
 * Completa o ambiente com segredos do Secrets Manager e parametros do SSM
 * Parameter Store, antes de a configuracao do Nest ser validada.
 *
 * - `CONFIG_AWS_SEGREDOS`: ids de segredos separados por virgula. O valor de
 *   cada um e um JSON plano (`{"JWT_SECRET": "..."}`); cada chave vira uma
 *   variavel de ambiente.
 * - `CONFIG_AWS_PARAMETROS`: caminho no Parameter Store (`/viajajunto/local/`);
 *   o ultimo trecho do nome de cada parametro vira a variavel.
 *
 * Sem nenhuma das duas, nada acontece - o `.env` continua valendo como sempre.
 * No compose elas apontam para o que a pilha CloudFormation criou no
 * MiniStack; na AWS, para os recursos reais, sem mudar uma linha de codigo.
 */
export async function carregarConfiguracaoDaAws(
  ambiente: Ambiente = process.env,
  logger = new Logger('ConfiguracaoAws'),
): Promise<void> {
  const segredos = (ambiente.CONFIG_AWS_SEGREDOS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const caminhoParametros = ambiente.CONFIG_AWS_PARAMETROS;

  if (segredos.length === 0 && !caminhoParametros) {
    return;
  }

  const opcoes = { region: ambiente.AWS_REGION || 'us-east-1' };

  if (segredos.length > 0) {
    const cliente = new SecretsManagerClient(opcoes);

    for (const id of segredos) {
      const { SecretString } = await comRetentativas(`o segredo ${id}`, () =>
        cliente.send(new GetSecretValueCommand({ SecretId: id })),
      );

      const valores = JSON.parse(SecretString ?? '{}') as Record<string, unknown>;
      const aplicadas = aplicar(ambiente, valores);
      logger.log(`Segredo ${id}: ${aplicadas.join(', ') || 'nada novo a aplicar'}`);
    }
  }

  if (caminhoParametros) {
    const cliente = new SSMClient(opcoes);
    const valores = await comRetentativas(`os parametros em ${caminhoParametros}`, () =>
      lerParametros(cliente, caminhoParametros),
    );

    const aplicadas = aplicar(ambiente, valores);
    logger.log(`Parametros ${caminhoParametros}: ${aplicadas.join(', ') || 'nada novo a aplicar'}`);
  }
}
