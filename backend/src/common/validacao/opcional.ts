import { ValidateIf } from 'class-validator';

/**
 * Campo que pode ser omitido, mas nao pode ser `null` - num PATCH, `null`
 * significaria apagar, e o campo e obrigatorio. Diferente do @IsOptional, que
 * deixaria o `null` passar sem validacao.
 */
export const OpcionalNaoNulo = () => ValidateIf((_objeto, valor) => valor !== undefined);
