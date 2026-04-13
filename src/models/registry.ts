import type { LanguageModel } from 'ai';
import { openrouter, anthropic, openai } from './providers.js';
import { env } from '../config/env.js';

export type LogicalModel = 'cheap' | 'premium';

/**
 * Resolve a model spec to a LanguageModel instance.
 * Spec forms:
 *   - logical name: "cheap" | "premium" (mapped via env)
 *   - provider-prefixed: "openrouter:<slug>", "anthropic:<slug>", "openai:<slug>"
 *   - bare slug: falls through to openrouter if configured
 */
export function resolveModel(spec: string): LanguageModel {
  const logical = spec === 'cheap' ? env.MODEL_CHEAP : spec === 'premium' ? env.MODEL_PREMIUM : spec;

  const [prefix, ...rest] = logical.split(':');
  const slug = rest.length > 0 ? rest.join(':') : logical;

  if (prefix === 'anthropic') {
    if (!anthropic) throw new Error('ANTHROPIC_API_KEY not configured');
    return anthropic(slug);
  }
  if (prefix === 'openai') {
    if (!openai) throw new Error('OPENAI_API_KEY not configured');
    return openai(slug);
  }
  if (prefix === 'openrouter') {
    if (!openrouter) throw new Error('OPENROUTER_API_KEY not configured');
    return openrouter(slug);
  }
  if (!openrouter) throw new Error('OPENROUTER_API_KEY not configured (default provider)');
  return openrouter(logical);
}
