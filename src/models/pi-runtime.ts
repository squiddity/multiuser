import { Agent, type AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage } from '@mariozechner/pi-ai';
import { getModel } from '@mariozechner/pi-ai';
import { Type } from 'typebox';
import type { LlmRuntime, LlmRuntimeRequest, LlmRuntimeResponse } from '../core/llm-runtime.js';

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
    const { provider, modelId } = parseModelSpec(request.modelSpec);
    const model = getModel(provider as never, modelId as never);

    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: request.systemPrompt,
        tools: toAgentTools(request),
      },
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
