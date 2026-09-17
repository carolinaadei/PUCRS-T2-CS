import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

/**
 * Traduz para portugues as mensagens padrao do class-validator, que sao em
 * ingles. Uma mensagem declarada no proprio decorator continua tendo
 * precedencia: chaves ausentes deste mapa caem no texto original.
 */
type Tradutor = (campo: string, original: string) => string;

/** O class-validator so entrega a mensagem ja montada, entao o limite numerico
 * (maxLength, min, ...) e lido de volta do texto original. */
const limite = (original: string) => original.match(/-?\d+(?:\.\d+)?/)?.[0] ?? '';

const MENSAGENS: Partial<Record<string, Tradutor>> = {
  isNotEmpty: (campo) => `${campo} nao pode ficar em branco`,
  isString: (campo) => `${campo} deve ser um texto`,
  isInt: (campo) => `${campo} deve ser um numero inteiro`,
  isNumber: (campo) => `${campo} deve ser um numero`,
  isEmail: (campo) => `${campo} deve ser um e-mail valido`,
  isUrl: (campo) => `${campo} deve ser uma URL valida`,
  isDateString: (campo) => `${campo} deve ser uma data no formato ISO 8601`,
  isLatitude: (campo) => `${campo} deve ser uma latitude valida`,
  isLongitude: (campo) => `${campo} deve ser uma longitude valida`,
  maxLength: (campo, original) => `${campo} deve ter no maximo ${limite(original)} caracteres`,
  minLength: (campo, original) => `${campo} deve ter no minimo ${limite(original)} caracteres`,
  max: (campo, original) => `${campo} deve ser menor ou igual a ${limite(original)}`,
  min: (campo, original) => `${campo} deve ser maior ou igual a ${limite(original)}`,
  isEnum: (campo, original) => `${campo} deve ser um destes valores: ${original.split(': ').pop()}`,
  whitelistValidation: (campo) => `${campo} nao e um campo valido`,
};

/**
 * Distingue a mensagem padrao do class-validator de uma declarada no decorator:
 * toda mensagem padrao comeca com o nome da propriedade. A do `whitelist` e a
 * excecao (comeca com "property") e nunca vem de um decorator.
 */
const ehMensagemPadrao = (chave: string, propriedade: string, original: string) =>
  chave === 'whitelistValidation' || original.startsWith(`${propriedade} `);

/** Achata a arvore de erros (DTOs aninhados incluidos) em uma lista de mensagens. */
export function traduzirErros(erros: ValidationError[], prefixo = ''): string[] {
  return erros.flatMap((erro) => {
    const campo = prefixo ? `${prefixo}.${erro.property}` : erro.property;

    const mensagens = Object.entries(erro.constraints ?? {}).map(([chave, original]) => {
      const tradutor = MENSAGENS[chave];

      return tradutor && ehMensagemPadrao(chave, erro.property, original)
        ? tradutor(campo, original)
        : original;
    });

    return [...mensagens, ...traduzirErros(erro.children ?? [], campo)];
  });
}

/** Pipe de validacao da aplicacao. Usado no bootstrap e nos testes e2e, para
 * que ambos exercitem exatamente a mesma configuracao. */
export const criarPipeValidacao = () =>
  new ValidationPipe({
    whitelist: true, // remove campos nao declarados nos DTOs
    forbidNonWhitelisted: true, // e rejeita a requisicao se houver algum
    transform: true, // converte payloads em instancias dos DTOs
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (erros: ValidationError[]) => new BadRequestException(traduzirErros(erros)),
  });
