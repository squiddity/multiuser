import type { ToolSet } from 'ai';

export interface LlmRuntimeRequest {
  modelSpec: string;
  systemPrompt: string;
  prompt: string;
  tools?: ToolSet;
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
