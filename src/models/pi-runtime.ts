import { Agent, type AgentTool } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, Model, ProviderResponse } from '@earendil-works/pi-ai';
import { getModel } from '@earendil-works/pi-ai';
import { Type } from 'typebox';
import type {
  CacheRetention,
  LlmRuntime,
  LlmRuntimeRequest,
  LlmRuntimeResponse,
  LlmTokenUsage,
} from '../core/llm-runtime.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ---------------------------------------------------------------------------
// Global telemetry event bus — used by the SSE monitor endpoint
// ---------------------------------------------------------------------------

export interface LlmTelemetryEvent {
  type: 'request_start' | 'response_complete' | 'response_error';
  timestamp: string;
  requestId: string;
  modelSpec: string;
  caller?: string;
  worker?: string;
  triggerId?: string;
  roomId?: string;
  userId?: string;
  // request_start only
  promptChars?: number;
  systemPromptChars?: number;
  sessionId?: string;
  // response_complete only
  elapsedMs?: number;
  responseChars?: number;
  usage?: LlmTokenUsage;
  tokensPerSecond?: number;
  cacheHeaders?: Record<string, string>;
  // response_error only
  error?: string;
}

type TelemetryListener = (event: LlmTelemetryEvent) => void;
const telemetryListeners: Set<TelemetryListener> = new Set();

export function onLlmTelemetry(listener: TelemetryListener): () => void {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

export function emitTelemetry(event: LlmTelemetryEvent): void {
  for (const listener of telemetryListeners) {
    try {
      listener(event);
    } catch {
      // listener errors are non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

let serializedQueue: Promise<void> = Promise.resolve();

async function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const start = serializedQueue;
  let release!: () => void;
  serializedQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await start;
  try {
    return await fn();
  } finally {
    release();
  }
}

export function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const idx = spec.indexOf(':');
  if (idx < 0) {
    throw new Error(`model spec must be "<provider>:<slug>": got "${spec}"`);
  }
  const provider = spec.slice(0, idx);
  const modelId = spec.slice(idx + 1);
  if (!modelId) {
    throw new Error(`model spec missing slug: "${spec}"`);
  }
  return { provider, modelId };
}

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

/**
 * Real per-million-token costs for common OpenRouter models (USD).
 * Source: https://openrouter.ai/models — prices as of May 2026.
 *
 * These are used by pi-ai to compute `usage.cost` from token counts.
 * pi-ai formula: cost = (model.cost.input * usage.input / 1_000_000) + ...
 */
const OPENROUTER_MODEL_COSTS: Record<
  string,
  { input: number; output: number; cacheRead?: number; cacheWrite?: number }
> = {
  'deepseek/deepseek-v4-flash': {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.075,
    cacheWrite: 0.15,
  },
  'deepseek/deepseek-chat': {
    input: 0.15,
    output: 0.6,
    cacheRead: 0.075,
    cacheWrite: 0.15,
  },
  'qwen/qwen-2.5-72b-instruct': {
    input: 0.35,
    output: 0.4,
  },
  'minimax/minimax-01': {
    input: 0.2,
    output: 0.2,
  },
  'anthropic/claude-sonnet-4-6': {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.0,
  },
  'anthropic/claude-opus-4-6': {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 15.0,
  },
  'openai/gpt-4o-mini': {
    input: 0.15,
    output: 0.6,
  },
};

function openRouterCostFor(modelId: string): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} {
  const known = OPENROUTER_MODEL_COSTS[modelId];
  if (known) {
    return {
      input: known.input,
      output: known.output,
      cacheRead: known.cacheRead ?? known.input * 0.5,
      cacheWrite: known.cacheWrite ?? known.input,
    };
  }
  // Unknown model — default to $0.10/M input, $0.40/M output (conservative)
  return { input: 0.1, output: 0.4, cacheRead: 0.05, cacheWrite: 0.1 };
}

export function resolveModel(spec: string): Model<any> {
  const { provider, modelId } = parseModelSpec(spec);
  const localProvider = env.LOCAL_MODEL_PROVIDER || 'local';

  if (env.LOCAL_MODEL_BASE_URL && provider === localProvider) {
    return {
      id: modelId,
      name: `${modelId} (${provider})`,
      api: 'openai-completions',
      provider,
      baseUrl: env.LOCAL_MODEL_BASE_URL,
      reasoning: env.LOCAL_MODEL_REASONING,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: env.LOCAL_MODEL_CONTEXT_WINDOW,
      maxTokens: env.LOCAL_MODEL_MAX_TOKENS,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: env.LOCAL_MODEL_REASONING,
        supportsUsageInStreaming: false,
        maxTokensField: 'max_tokens',
      },
    } satisfies Model<'openai-completions'>;
  }

  if (provider === 'openrouter') {
    const resolved = getModel(provider as never, modelId as never);
    const needsPatch =
      !resolved || resolved.api === 'unknown' || !('baseUrl' in resolved) || !resolved.baseUrl;

    const costs = openRouterCostFor(modelId);

    // Try pi's built-in model entry first
    if (!needsPatch) {
      // Override costs if our table has better info
      return {
        ...resolved,
        cost: {
          input: costs.input,
          output: costs.output,
          cacheRead: costs.cacheRead,
          cacheWrite: costs.cacheWrite,
        },
        compat: {
          ...((resolved.compat ?? {}) as Record<string, unknown>),
          sendSessionAffinityHeaders: true,
        },
      };
    }

    return {
      id: modelId,
      name: `${modelId} (${provider})`,
      api: 'openai-completions' as const,
      provider,
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: false,
      input: ['text'],
      cost: {
        input: costs.input,
        output: costs.output,
        cacheRead: costs.cacheRead,
        cacheWrite: costs.cacheWrite,
      },
      contextWindow: env.LOCAL_MODEL_CONTEXT_WINDOW,
      maxTokens: env.LOCAL_MODEL_MAX_TOKENS,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: true,
        maxTokensField: 'max_tokens',
        sendSessionAffinityHeaders: true,
      },
    } satisfies Model<'openai-completions'>;
  }

  const resolved = getModel(provider as never, modelId as never);
  if (!resolved) {
    throw new Error(`Unknown model spec: ${spec}`);
  }
  return resolved;
}

export function resolveApiKey(provider: string): string | undefined {
  const localProvider = env.LOCAL_MODEL_PROVIDER || 'local';
  if (env.LOCAL_MODEL_BASE_URL && provider === localProvider) {
    return env.LOCAL_MODEL_API_KEY || 'dummy';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Message extraction
// ---------------------------------------------------------------------------

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function assistantThinking(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: 'thinking'; thinking: string } => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('');
}

function extractUsage(
  lastAssistant: AssistantMessage,
  elapsedMs: number,
): { usage: LlmTokenUsage; tokensPerSecond: number } {
  const u = lastAssistant.usage;
  const inputTokens = u?.input ?? 0;
  const outputTokens = u?.output ?? 0;
  const cacheRead = u?.cacheRead ?? 0;
  const cacheWrite = u?.cacheWrite ?? 0;
  const totalTokens = u?.totalTokens ?? inputTokens + outputTokens;

  const costInput = u?.cost?.input ?? 0;
  const costOutput = u?.cost?.output ?? 0;
  const costCacheRead = u?.cost?.cacheRead ?? 0;
  const costCacheWrite = u?.cost?.cacheWrite ?? 0;

  const tokensPerSecond = outputTokens > 0 && elapsedMs > 0 ? outputTokens / (elapsedMs / 1000) : 0;

  return {
    usage: {
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite,
      totalTokens,
      cost: {
        input: costInput,
        output: costOutput,
        cacheRead: costCacheRead,
        cacheWrite: costCacheWrite,
        total: costInput + costOutput + costCacheRead + costCacheWrite,
      },
    },
    tokensPerSecond,
  };
}

const CACHE_HEADER_KEYS = [
  'x-cache',
  'x-vercel-cache',
  'cf-cache-status',
  'x-amzn-requestid',
  'x-request-id',
  'anthropic-ratelimit-requests-limit',
  'anthropic-ratelimit-tokens-limit',
  'x-rate-limit-limit',
  'x-rate-limit-remaining',
  'x-rate-limit-reset',
];

export function extractCacheHeaders(response: ProviderResponse): Record<string, string> {
  const extracted: Record<string, string> = {};
  for (const key of CACHE_HEADER_KEYS) {
    const val = response.headers[key] ?? response.headers[key.toLowerCase()];
    if (val) {
      extracted[key] = val;
    }
  }
  return extracted;
}

// ---------------------------------------------------------------------------
// Tool adapter
// ---------------------------------------------------------------------------

function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

export function toAgentTools(request: LlmRuntimeRequest): AgentTool[] {
  if (!request.tools || Object.keys(request.tools).length === 0) return [];

  return Object.entries(request.tools).map(([name, tool]) => ({
    name,
    label: name,
    description: tool.description,
    parameters: Type.Any(),
    prepareArguments: (args) => {
      const parsed = tool.parameters.safeParse(args);
      if (!parsed.success) {
        throw new Error(parsed.error.message);
      }
      return parsed.data;
    },
    execute: async (_toolCallId, params) => {
      const result = await tool.execute(params);
      return {
        content: [{ type: 'text', text: serializeToolResult(result) }],
        details: result,
      };
    },
  }));
}

// ---------------------------------------------------------------------------
// Runtime implementation
// ---------------------------------------------------------------------------

export class PiAiLlmRuntime implements LlmRuntime {
  async generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse> {
    const { provider } = parseModelSpec(request.modelSpec);
    const model = resolveModel(request.modelSpec);
    const startedAt = Date.now();
    const requestId = request.metadata?.requestId ?? `llm-${Date.now()}`;

    // Determine cache retention from request, env, or default
    const cacheRetention: CacheRetention = request.cacheRetention ?? env.CACHE_RETENTION ?? 'short';

    // Derive session ID from request or metadata
    const sessionId = request.sessionId ?? deriveSessionId(request);

    // Accumulate response headers from onResponse
    let lastResponseHeaders: Record<string, string> | undefined;

    // Log request start
    const startLog = logger.info(
      {
        requestId,
        modelSpec: request.modelSpec,
        caller: request.metadata?.caller,
        worker: request.metadata?.worker,
        triggerId: request.metadata?.triggerId,
        roomId: request.metadata?.roomId,
        userId: request.metadata?.userId,
        sessionId,
        cacheRetention,
        promptChars: request.prompt.length,
        systemPromptChars: request.systemPrompt.length,
      },
      'llm-runtime: request start',
    );
    startLog;

    emitTelemetry({
      type: 'request_start',
      timestamp: new Date(startedAt).toISOString(),
      requestId,
      modelSpec: request.modelSpec,
      caller: request.metadata?.caller,
      worker: request.metadata?.worker,
      triggerId: request.metadata?.triggerId,
      roomId: request.metadata?.roomId,
      userId: request.metadata?.userId,
      sessionId,
      promptChars: request.prompt.length,
      systemPromptChars: request.systemPrompt.length,
    });

    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: request.systemPrompt,
        tools: toAgentTools(request),
      },
      sessionId,
      getApiKey: () => resolveApiKey(provider),

      // --- onPayload: inspect the serialized provider payload ---
      onPayload: (payload) => {
        if (env.LOG_LLM_INPUT) {
          logger.debug(
            { requestId, payload: JSON.stringify(payload).slice(0, 8000) },
            'llm-runtime: provider payload',
          );
        }
        return undefined;
      },

      // --- onResponse: capture cache headers ---
      onResponse: (response) => {
        const cacheHeaders = extractCacheHeaders(response);
        lastResponseHeaders = cacheHeaders;

        if (Object.keys(cacheHeaders).length > 0) {
          logger.debug({ requestId, cacheHeaders }, 'llm-runtime: response headers');
        }
      },
    });

    const runPrompt = async () => {
      await withTimeout(
        agent.prompt(request.prompt),
        env.LLM_CALL_TIMEOUT_MS,
        `LLM prompt (${request.modelSpec})`,
      );
    };

    try {
      if (env.LLM_SERIALIZE_CALLS) {
        logger.info(
          { requestId, modelSpec: request.modelSpec },
          'llm-runtime: waiting for serialize gate',
        );
        await runSerialized(runPrompt);
      } else {
        await runPrompt();
      }

      const elapsedMs = Date.now() - startedAt;

      const lastAssistant = [...agent.state.messages]
        .reverse()
        .find((msg): msg is AssistantMessage => msg.role === 'assistant');

      if (!lastAssistant) {
        logger.warn(
          {
            requestId,
            elapsedMs,
            modelSpec: request.modelSpec,
          },
          'llm-runtime: request completed without assistant message',
        );

        emitTelemetry({
          type: 'response_complete',
          timestamp: new Date().toISOString(),
          requestId,
          modelSpec: request.modelSpec,
          elapsedMs,
          responseChars: 0,
          caller: request.metadata?.caller,
          roomId: request.metadata?.roomId,
          cacheHeaders: lastResponseHeaders,
        });

        return { text: '' };
      }

      const text = assistantText(lastAssistant);
      const thinkingText = assistantThinking(lastAssistant);
      const { usage, tokensPerSecond } = extractUsage(lastAssistant, elapsedMs);

      // Rich success log with all telemetry
      logger.info(
        {
          requestId,
          elapsedMs,
          modelSpec: request.modelSpec,
          caller: request.metadata?.caller,
          sessionId,
          cacheRetention,
          // Token counts
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
          totalTokens: usage.totalTokens,
          // Cost
          costInput: usage.cost.input,
          costOutput: usage.cost.output,
          costCacheRead: usage.cost.cacheRead,
          costCacheWrite: usage.cost.cacheWrite,
          costTotal: usage.cost.total,
          // Performance
          tokensPerSecond: tokensPerSecond.toFixed(1),
          responseChars: text.length,
          thinkingChars: thinkingText.length,
          // Cache headers from provider
          cacheHeaders: lastResponseHeaders,
        },
        'llm-runtime: request success',
      );

      emitTelemetry({
        type: 'response_complete',
        timestamp: new Date().toISOString(),
        requestId,
        modelSpec: request.modelSpec,
        caller: request.metadata?.caller,
        worker: request.metadata?.worker,
        triggerId: request.metadata?.triggerId,
        roomId: request.metadata?.roomId,
        userId: request.metadata?.userId,
        elapsedMs,
        responseChars: text.length,
        usage,
        tokensPerSecond,
        cacheHeaders: lastResponseHeaders,
      });

      return { text, usage, tokensPerSecond };
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error(
        {
          requestId,
          elapsedMs,
          modelSpec: request.modelSpec,
          caller: request.metadata?.caller,
          worker: request.metadata?.worker,
          triggerId: request.metadata?.triggerId,
          roomId: request.metadata?.roomId,
          userId: request.metadata?.userId,
          sessionId,
          err,
        },
        'llm-runtime: request failed',
      );

      emitTelemetry({
        type: 'response_error',
        timestamp: new Date().toISOString(),
        requestId,
        modelSpec: request.modelSpec,
        caller: request.metadata?.caller,
        worker: request.metadata?.worker,
        triggerId: request.metadata?.triggerId,
        roomId: request.metadata?.roomId,
        userId: request.metadata?.userId,
        elapsedMs,
        error: errorMessage,
      });

      throw err;
    }
  }
}

export function createPiAiLlmRuntime(): LlmRuntime {
  return new PiAiLlmRuntime();
}

// ---------------------------------------------------------------------------
// Session-aware runtime factory
// ---------------------------------------------------------------------------

import { SessionAwareRuntime, type SessionRuntimeDeps } from './session-runtime.js';

function createDefaultSessionDeps(): SessionRuntimeDeps {
  return {
    resolveModel,
    resolveApiKey,
    toAgentTools,
    parseModelSpec,
    deriveSessionId,
    extractCacheHeaders,
  };
}

let _defaultSessionRuntime: SessionAwareRuntime | null = null;

/**
 * Get or create a singleton SessionAwareRuntime with default deps.
 * This is the primary entrypoint for the session-aware narrator path.
 */
export function getSessionRuntime(): SessionAwareRuntime {
  if (!_defaultSessionRuntime) {
    _defaultSessionRuntime = new SessionAwareRuntime(createDefaultSessionDeps());
  }
  return _defaultSessionRuntime;
}

/**
 * For testing — create a fresh SessionAwareRuntime with custom deps.
 */
export function createSessionRuntime(deps?: SessionRuntimeDeps): SessionAwareRuntime {
  return new SessionAwareRuntime(deps ?? createDefaultSessionDeps());
}

// ---------------------------------------------------------------------------
// Session ID derivation
// ---------------------------------------------------------------------------

/**
 * Derive a stable session identifier from the request metadata.
 * This is used for provider-side prompt caching.
 *
 * Strategy: use roomId + caller, or caller + worker, or a hash of the
 * system prompt (stable prefix). The goal is to produce the same ID
 * for semantically related requests so the provider can reuse cached
 * prompt prefixes.
 */
export function deriveSessionId(request: LlmRuntimeRequest): string {
  const md = request.metadata;

  // Best: room-based session — same room = same session
  if (md?.roomId) {
    return `room:${md.roomId}`;
  }

  // Next: caller-based session
  if (md?.caller) {
    return `caller:${md.caller}`;
  }

  // Fallback: worker-based session
  if (md?.worker) {
    return `worker:${md.worker}`;
  }

  // Last resort: hash of first 200 chars of system prompt (stable instructions)
  const prefix = request.systemPrompt.slice(0, 200);
  let hash = 0;
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `prompt-hash:${Math.abs(hash).toString(36)}`;
}
