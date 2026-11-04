import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
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
 * Em desenvolvimento e teste quase tudo e opcional: a aplicacao sobe sem nenhuma
 * configuracao e os e-mails saem no log. Em producao os segredos e um provedor
 * de e-mail de verdade passam a ser exigidos.
 */
class VariaveisAmbiente {
  @IsEnum(Ambiente, { message: 'NODE_ENV deve ser development, production ou test' })
  @IsOptional()
  NODE_ENV?: Ambiente;

  @IsNumber({}, { message: 'PORT deve ser um numero' })
  @Min(1, { message: 'PORT deve ser positiva' })
  @IsOptional()
  PORT?: number;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'PUBLIC_URL deve ser uma URL com protocolo (ex.: https://api.exemplo.com)' },
  )
  @IsOptional()
  PUBLIC_URL?: string;

  // Continua sempre obrigatoria: o Prisma le esta variavel por conta propria, e
  // sem ela o erro apareceria so na primeira query, mais dificil de diagnosticar.
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL e obrigatoria (veja .env.example)' })
  DATABASE_URL!: string;

  @SoEmProducao()
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET e obrigatorio em producao, com ao menos 32 caracteres' })
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @IsInt({ message: 'REFRESH_TOKEN_DIAS deve ser um numero inteiro' })
  @Min(1, { message: 'REFRESH_TOKEN_DIAS deve ser de pelo menos 1 dia' })
  @IsOptional()
  REFRESH_TOKEN_DIAS?: number;

  @SoEmProducao()
  @IsString()
  @MinLength(32, {
    message: 'RECUPERACAO_CODIGO_SECRET e obrigatorio em producao, com ao menos 32 caracteres',
  })
  RECUPERACAO_CODIGO_SECRET?: string;

  // Em producao "log" nao vale (conferido em validarEnv): o codigo de
  // recuperacao de senha precisa chegar ao usuario.
  @IsIn(['log', 'ses', 'brevo'], { message: 'MAIL_PROVEDOR deve ser log, ses ou brevo' })
  @IsOptional()
  MAIL_PROVEDOR?: string;

  @SoEmProducao()
  @IsEmail({}, { message: 'EMAIL_REMETENTE deve ser um e-mail valido' })
  EMAIL_REMETENTE?: string;

  @ValidateIf((v: VariaveisAmbiente) => v.MAIL_PROVEDOR === 'brevo')
  @IsString()
  @IsNotEmpty({ message: 'BREVO_API_KEY e obrigatoria com MAIL_PROVEDOR=brevo' })
  BREVO_API_KEY?: string;

  @IsString()
  @IsOptional()
  S3_BUCKET_MIDIA?: string;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'S3_ENDPOINT_PUBLICO deve ser uma URL com protocolo' },
  )
  @IsOptional()
  S3_ENDPOINT_PUBLICO?: string;

  @IsInt({ message: 'UPLOAD_TAMANHO_MAXIMO_MB deve ser um numero inteiro' })
  @Min(1, { message: 'UPLOAD_TAMANHO_MAXIMO_MB deve ser de pelo menos 1' })
  @IsOptional()
  UPLOAD_TAMANHO_MAXIMO_MB?: number;
}

export function validarEnv(config: Record<string, unknown>) {
  const instancia = plainToInstance(VariaveisAmbiente, config, {
    enableImplicitConversion: true,
  });

  const problemas = validateSync(instancia, { skipMissingProperties: false }).map((erro) =>
    Object.values(erro.constraints ?? {}).join(', '),
  );

  if (
    instancia.NODE_ENV === Ambiente.Production &&
    !['ses', 'brevo'].includes(instancia.MAIL_PROVEDOR ?? '')
  ) {
    problemas.push('MAIL_PROVEDOR deve ser ses ou brevo em producao');
  }

  if (problemas.length > 0) {
    throw new Error(`Configuracao de ambiente invalida: ${problemas.join('; ')}`);
  }

  return config;
}

/**
 * Variaveis ausentes que cairam num valor padrao de desenvolvimento.
 * O `main.ts` avisa no boot para que ninguem suba assim sem perceber.
 */
export function padroesDeDesenvolvimentoEmUso(): string[] {
  const ausentes: string[] = (['JWT_SECRET', 'RECUPERACAO_CODIGO_SECRET'] as const).filter(
    (nome) => !process.env[nome],
  );

  if (!process.env.MAIL_PROVEDOR || process.env.MAIL_PROVEDOR === 'log') {
    ausentes.push('MAIL_PROVEDOR (e-mails saem so no log)');
  }

  return ausentes;
}
