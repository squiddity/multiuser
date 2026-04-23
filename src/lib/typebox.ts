import type { Static, TSchema } from 'typebox';
import Value from 'typebox/value';

export interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

export interface SafeParseFailure {
  success: false;
  error: Error;
}

export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

export type ValidatedSchema<TSchemaType extends TSchema> = TSchemaType & {
  parse(value: unknown): Static<TSchemaType>;
  safeParse(value: unknown): SafeParseResult<Static<TSchemaType>>;
};

function parseWithDefaults<TSchemaType extends TSchema>(
  schema: TSchemaType,
  value: unknown,
): Static<TSchemaType> {
  const withDefaults = Value.Default(schema, value);
  return Value.Parse(schema, withDefaults) as Static<TSchemaType>;
}

export function withValidation<TSchemaType extends TSchema>(
  schema: TSchemaType,
): ValidatedSchema<TSchemaType> {
  const typed = schema as ValidatedSchema<TSchemaType>;

  Object.defineProperties(typed, {
    parse: {
      value: (value: unknown) => parseWithDefaults(schema, value),
      enumerable: false,
      configurable: false,
      writable: false,
    },
    safeParse: {
      value: (value: unknown): SafeParseResult<Static<TSchemaType>> => {
        try {
          return { success: true, data: parseWithDefaults(schema, value) };
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          return { success: false, error: err };
        }
      },
      enumerable: false,
      configurable: false,
      writable: false,
    },
  });

  return typed;
}
