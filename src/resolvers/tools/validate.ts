import { CharacterDraft } from '../../core/onboarding.js';
import type { Static } from 'typebox';
import type { CharacterDraft as CharacterDraftType } from '../../core/onboarding.js';

export interface ValidationSuccess {
  valid: true;
  draft: CharacterDraftType;
}

export interface ValidationError {
  valid: false;
  errors: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult = ValidationSuccess | ValidationError;

/**
 * Validate a character draft against the TypeBox CharacterDraft schema.
 * Only `name` is hardcoded; all other fields live in the flexible `profile` record.
 */
export function validateCharacterDraft(draft: unknown): ValidationResult {
  const parsed = CharacterDraft.safeParse(draft);

  if (parsed.success) {
    return { valid: true, draft: parsed.data };
  }

  const errors: FieldError[] = [];
  const errorText = parsed.error.message;

  if (!draft || typeof draft !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'draft', message: 'Character draft is missing or invalid.' }],
    };
  }

  const d = draft as Record<string, unknown>;

  // Name is the only hardcoded required field
  if (!d.name || typeof d.name !== 'string' || d.name.trim().length < 2) {
    errors.push({
      field: 'name',
      message: 'Character name is required (2–40 characters).',
    });
  } else if (d.name.trim().length > 40) {
    errors.push({
      field: 'name',
      message: 'Character name must be 40 characters or fewer.',
    });
  }

  // Profile must be present with at least one entry
  if (
    !d.profile ||
    typeof d.profile !== 'object' ||
    Object.keys(d.profile as object).length === 0
  ) {
    errors.push({
      field: 'profile',
      message: 'At least one profile field must be set.',
    });
  }

  return {
    valid: false,
    errors: errors.length > 0 ? errors : [{ field: 'draft', message: errorText }],
  };
}

/**
 * Build a user-facing error summary for feeding back to the agent conversationally.
 */
export function formatValidationErrors(result: ValidationError): string {
  return result.errors.map((e) => `${e.field}: ${e.message}`).join('\n');
}
