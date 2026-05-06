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
 * Returns structured errors per field for conversational recovery.
 */
export function validateCharacterDraft(draft: unknown): ValidationResult {
  const parsed = CharacterDraft.safeParse(draft);

  if (parsed.success) {
    return { valid: true, draft: parsed.data };
  }

  // Convert TypeBox errors to per-field structured errors
  const errors: FieldError[] = [];

  // Parse the error message for field-level issues
  const errorText = parsed.error.message;

  if (!draft || typeof draft !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'draft', message: 'Character draft is missing or invalid.' }],
    };
  }

  const d = draft as Record<string, unknown>;

  // Check each required field
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

  // pronouns is optional — only flag if present but invalid
  if (d.pronouns !== undefined && d.pronouns !== null) {
    if (typeof d.pronouns !== 'string') {
      errors.push({
        field: 'pronouns',
        message: 'Pronouns must be a short text value.',
      });
    } else if (d.pronouns.length > 60) {
      errors.push({
        field: 'pronouns',
        message: 'Pronouns must be 60 characters or fewer.',
      });
    }
  }

  if (
    !d.profile ||
    typeof d.profile !== 'object' ||
    Object.keys(d.profile as object).length === 0
  ) {
    errors.push({
      field: 'profile',
      message: 'An archetype must be selected.',
    });
  }

  if (!d.hook || typeof d.hook !== 'string' || d.hook.trim().length < 10) {
    errors.push({
      field: 'hook',
      message: 'Backstory hook is required (10–280 characters).',
    });
  } else if (d.hook.trim().length > 280) {
    errors.push({
      field: 'hook',
      message: 'Backstory hook must be 280 characters or fewer.',
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
