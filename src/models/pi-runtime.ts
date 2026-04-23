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

export class PiAiLlmRuntime implements LlmRuntime {
  async generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse> {
    const { provider, modelId } = parseModelSpec(request.modelSpec);
    const model = getModel(provider as never, modelId as never);

    const toolsSection = this.buildToolsSection(request);
    const userPrompt = toolsSection ? `${request.prompt}\n\n${toolsSection}` : request.prompt;

    const message = await complete(model, {
      systemPrompt: request.systemPrompt,
      messages: [{ role: 'user', content: userPrompt, timestamp: Date.now() }],
    });

    return { text: extractText(message) };
  }

  private buildToolsSection(request: LlmRuntimeRequest): string {
    if (!request.tools || Object.keys(request.tools).length === 0) return '';

    const lines = Object.entries(request.tools).map(([name, tool]) => {
      const shape = tool.parameters?._def ? '[zod schema]' : '[unknown schema]';
      return `- ${name}: ${tool.description} ${shape}`;
    });

    return [
      '## Available tools',
      'This runtime does not execute tool calls directly. If a tool result is required, explain assumptions in your JSON output.',
      ...lines,
    ].join('\n');
  }
}

export function createPiAiLlmRuntime(): LlmRuntime {
  return new PiAiLlmRuntime();
}
