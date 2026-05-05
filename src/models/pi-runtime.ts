import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Model } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from 'typebox';
import type { LlmRuntime, LlmRuntimeRequest, LlmRuntimeResponse } from '../core/llm-runtime.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

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

function parseModelSpec(spec: string): { provider: string; modelId: string } {
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

function resolveModel(spec: string): Model<any> {
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
    return {
      id: modelId,
      name: `${modelId} (${provider})`,
      api: 'openai-completions',
      provider,
      baseUrl: 'https://openrouter.ai/api/v1',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: env.LOCAL_MODEL_CONTEXT_WINDOW,
      maxTokens: env.LOCAL_MODEL_MAX_TOKENS,
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: false,
        maxTokensField: 'max_tokens',
      },
    } satisfies Model<'openai-completions'>;
  }

  const resolved = getModel(provider as never, modelId as never);
  if (!resolved) {
    throw new Error(`Unknown model spec: ${spec}`);
  }
  return resolved;
}

function resolveApiKey(provider: string): string | undefined {
  const localProvider = env.LOCAL_MODEL_PROVIDER || 'local';
  if (env.LOCAL_MODEL_BASE_URL && provider === localProvider) {
    return env.LOCAL_MODEL_API_KEY || 'dummy';
  }
  return undefined;
}

function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function serializeToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function toAgentTools(request: LlmRuntimeRequest): AgentTool[] {
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

export class PiAiLlmRuntime implements LlmRuntime {
  async generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse> {
    const { provider } = parseModelSpec(request.modelSpec);
    const model = resolveModel(request.modelSpec);
    const startedAt = Date.now();
    const requestId = request.metadata?.requestId ?? `llm-${Date.now()}`;

    logger.info(
      {
        requestId,
        modelSpec: request.modelSpec,
        caller: request.metadata?.caller,
        worker: request.metadata?.worker,
        triggerId: request.metadata?.triggerId,
        roomId: request.metadata?.roomId,
        userId: request.metadata?.userId,
        promptChars: request.prompt.length,
      },
      'llm-runtime: request start',
    );
    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: request.systemPrompt,
        tools: toAgentTools(request),
      },
      getApiKey: () => resolveApiKey(provider),
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

      const lastAssistant = [...agent.state.messages]
        .reverse()
        .find((msg): msg is AssistantMessage => msg.role === 'assistant');

      if (!lastAssistant) {
        logger.warn(
          {
            requestId,
            elapsedMs: Date.now() - startedAt,
            modelSpec: request.modelSpec,
          },
          'llm-runtime: request completed without assistant message',
        );
        return { text: '' };
      }

      const text = assistantText(lastAssistant);
      logger.info(
        {
          requestId,
          elapsedMs: Date.now() - startedAt,
          modelSpec: request.modelSpec,
          responseChars: text.length,
        },
        'llm-runtime: request success',
      );
      return { text };
    } catch (err) {
      logger.error(
        {
          requestId,
          elapsedMs: Date.now() - startedAt,
          modelSpec: request.modelSpec,
          caller: request.metadata?.caller,
          worker: request.metadata?.worker,
          triggerId: request.metadata?.triggerId,
          roomId: request.metadata?.roomId,
          userId: request.metadata?.userId,
          err,
        },
        'llm-runtime: request failed',
      );
      throw err;
    }
  }
}

export function createPiAiLlmRuntime(): LlmRuntime {
  return new PiAiLlmRuntime();
}
