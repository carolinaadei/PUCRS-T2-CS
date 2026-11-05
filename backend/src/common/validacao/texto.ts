import { Transform, TransformFnParams } from 'class-transformer';

/** Apara os espacos antes de validar: um texto so de espacos conta como vazio. */
export const Aparar = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Texto opcional: apara os espacos, e em branco vira null - o mesmo que nao ter. */
export const ApararOuNulo = () =>
  Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() || null : value,
  );
