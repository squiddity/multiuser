import type { LanguageModel } from 'ai';
import { openrouter, anthropic, openai } from './providers.js';

/**
 * Resolve a provider-prefixed model spec to an AI SDK LanguageModel.
 * Spec form: "<provider>:<slug>" where provider is openrouter | anthropic | openai.
 * Agent definitions own their model choice; no logical aliasing.
 */
export function resolveModel(spec: string): LanguageModel {
  const idx = spec.indexOf(':');
  if (idx < 0) throw new Error(`model spec must be "<provider>:<slug>": got "${spec}"`);
  const provider = spec.slice(0, idx);
  const slug = spec.slice(idx + 1);
  if (!slug) throw new Error(`model spec missing slug: "${spec}"`);

  switch (provider) {
    case 'openrouter':
      if (!openrouter) throw new Error('OPENROUTER_API_KEY not configured');
      return openrouter(slug);
    case 'anthropic':
      if (!anthropic) throw new Error('ANTHROPIC_API_KEY not configured');
      return anthropic(slug);
    case 'openai':
      if (!openai) throw new Error('OPENAI_API_KEY not configured');
      return openai(slug);
    default:
      throw new Error(`unknown model provider: "${provider}"`);
  }
}
