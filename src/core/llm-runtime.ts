import type { TSchema } from 'typebox';
import type { ValidatedSchema } from '../lib/typebox.js';

export interface LlmToolDefinition {
  description: string;
  parameters: ValidatedSchema<TSchema>;
  execute: (params: any) => Promise<unknown>;
}

export interface LlmRuntimeRequest {
  modelSpec: string;
  systemPrompt: string;
  prompt: string;
  tools?: Record<string, LlmToolDefinition>;
}

export interface LlmRuntimeResponse {
  text: string;
}

/**
 * LLM runtime abstraction for agent turns.
 *
 * This keeps caller code independent from any specific SDK runtime implementation
 * (AI SDK today, pi-agent-core runtime later).
 */
export interface LlmRuntime {
  generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse>;
}
