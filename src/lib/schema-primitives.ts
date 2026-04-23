import { Type } from 'typebox';

export const UUID = Type.String({ format: 'uuid' });
export const DateTime = Type.String({ format: 'date-time' });
export const NonEmptyString = Type.String({ minLength: 1 });

export const RulesVariant = Type.Union([Type.Literal('base'), Type.Literal('house')], {
  default: 'base',
});
