import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

enum Ambiente {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Exige a variavel apenas em producao; fora dela o campo nem e validado. */
const SoEmProducao = () => ValidateIf((v: VariaveisAmbiente) => v.NODE_ENV === Ambiente.Production);

/**
 * Falha rapido no boot quando uma variavel obrigatoria esta ausente ou invalida,
 * em vez de quebrar em runtime na primeira requisicao.
 *
 * Em desenvolvimento e teste as chaves de integracao sao opcionais: a aplicacao
 * sobe sem nenhuma configuracao e o RF03 continua testavel, porque o codigo de
 * 6 digitos aparece no `Logger.debug`. Em producao todas voltam a ser exigidas,
 * onde rodar com um segredo padrao seria uma falha de seguranca.
 */
class VariaveisAmbiente {
  @IsEnum(Ambiente)
  @IsOptional()
  NODE_ENV?: Ambiente;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT?: number;

  // Continua sempre obrigatoria: o Prisma le esta variavel por conta propria, e
  // sem ela o erro apareceria so na primeira query, mais dificil de diagnosticar.
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL e obrigatoria (veja .env.example)' })
  DATABASE_URL!: string;

  @SoEmProducao()
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET e obrigatorio em producao (veja .env.example)' })
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  // RF03 - pepper do HMAC do codigo de 6 digitos.
  @SoEmProducao()
  @IsString()
  @IsNotEmpty({ message: 'RECUPERACAO_CODIGO_SECRET e obrigatorio em producao' })
  @MinLength(32, { message: 'RECUPERACAO_CODIGO_SECRET deve ter ao menos 32 caracteres' })
  RECUPERACAO_CODIGO_SECRET?: string;

  @SoEmProducao()
  @IsString()
  @IsNotEmpty({ message: 'BREVO_API_KEY e obrigatoria em producao (veja .env.example)' })
  BREVO_API_KEY?: string;

  @SoEmProducao()
  @IsEmail({}, { message: 'BREVO_SENDER_EMAIL deve ser um e-mail valido' })
  BREVO_SENDER_EMAIL?: string;

  @IsString()
  @IsOptional()
  BREVO_SENDER_NOME?: string;
}

export function validarEnv(config: Record<string, unknown>) {
  const instancia = plainToInstance(VariaveisAmbiente, config, {
    enableImplicitConversion: true,
  });

  const erros = validateSync(instancia, { skipMissingProperties: false });

  if (erros.length > 0) {
    const detalhes = erros
      .map((erro) => Object.values(erro.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Configuracao de ambiente invalida: ${detalhes}`);
  }

  return config;
}

/**
 * Variaveis ausentes que cairam num valor padrao de desenvolvimento.
 * O `main.ts` avisa no boot para que ninguem suba assim sem perceber.
 */
export function padroesDeDesenvolvimentoEmUso(): string[] {
  return (
    ['JWT_SECRET', 'RECUPERACAO_CODIGO_SECRET', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL'] as const
  ).filter((nome) => !process.env[nome]);
}
