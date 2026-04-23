import { complete, getModel } from '@mariozechner/pi-ai';
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

function extractText(message: Awaited<ReturnType<typeof complete>>): string {
  return message.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * pi-ai runtime adapter for non-tool turns.
 *
 * Tool-enabled turns continue to use AI SDK runtime until tool definitions are
 * migrated to pi-agent-core tool contracts.
 */
export class PiAiLlmRuntime implements LlmRuntime {
  async generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse> {
    if (request.tools && Object.keys(request.tools).length > 0) {
      throw new Error('PiAiLlmRuntime does not support AI SDK tool definitions');
    }

    const { provider, modelId } = parseModelSpec(request.modelSpec);
    const model = getModel(provider as never, modelId as never);
    const message = await complete(model, {
      systemPrompt: request.systemPrompt,
      messages: [{ role: 'user', content: request.prompt, timestamp: Date.now() }],
    });

    return { text: extractText(message) };
  }
}

export function createPiAiLlmRuntime(): LlmRuntime {
  return new PiAiLlmRuntime();
}
