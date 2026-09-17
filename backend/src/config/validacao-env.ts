import { plainToInstance } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

enum Ambiente {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Falha rapido no boot quando uma variavel obrigatoria esta ausente ou invalida,
 * em vez de quebrar em runtime na primeira requisicao.
 */
class VariaveisAmbiente {
  @IsEnum(Ambiente)
  @IsOptional()
  NODE_ENV?: Ambiente;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL e obrigatoria (veja .env.example)' })
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET e obrigatorio (veja .env.example)' })
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  // RF03 - base do link de redefinicao enviado por e-mail.
  @IsString()
  @IsNotEmpty({ message: 'FRONTEND_URL e obrigatoria (veja .env.example)' })
  FRONTEND_URL!: string;

  @IsString()
  @IsNotEmpty({ message: 'BREVO_API_KEY e obrigatoria (veja .env.example)' })
  BREVO_API_KEY!: string;

  @IsEmail({}, { message: 'BREVO_SENDER_EMAIL deve ser um e-mail valido' })
  BREVO_SENDER_EMAIL!: string;

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
