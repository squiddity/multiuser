import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Model } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from 'typebox';
import type { LlmRuntime, LlmRuntimeRequest, LlmRuntimeResponse } from '../core/llm-runtime.js';
import { env } from '../config/env.js';

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

  return getModel(provider as never, modelId as never);
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

    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: request.systemPrompt,
        tools: toAgentTools(request),
      },
      getApiKey: () => resolveApiKey(provider),
    });

    await agent.prompt(request.prompt);

    const lastAssistant = [...agent.state.messages]
      .reverse()
      .find((msg): msg is AssistantMessage => msg.role === 'assistant');

    if (!lastAssistant) {
      return { text: '' };
    }

    return { text: assistantText(lastAssistant) };
  }
}

export function createPiAiLlmRuntime(): LlmRuntime {
  return new PiAiLlmRuntime();
}
