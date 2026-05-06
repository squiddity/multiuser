import type { TSchema } from 'typebox';
import type { ValidatedSchema } from '../lib/typebox.js';

export interface LlmToolDefinition {
  description: string;
  parameters: ValidatedSchema<TSchema>;
  execute: (params: any) => Promise<unknown>;
}

export type CacheRetention = 'short' | 'long';

export interface LlmRuntimeRequest {
  modelSpec: string;
  systemPrompt: string;
  prompt: string;
  tools?: Record<string, LlmToolDefinition>;
  /** Stable session identifier for cache-friendly backends */
  sessionId?: string;
  /** Cache retention preference */
  cacheRetention?: CacheRetention;
  metadata?: {
    requestId?: string;
    caller?: string;
    worker?: string;
    triggerId?: string;
    roomId?: string;
    userId?: string;
  };
}

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface LlmRuntimeResponse {
  text: string;
  usage?: LlmTokenUsage;
  /** Tokens per second (outputTokens / elapsedMs * 1000) */
  tokensPerSecond?: number;
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
