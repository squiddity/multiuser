import { generateText } from 'ai';
import type { LlmRuntime, LlmRuntimeRequest, LlmRuntimeResponse } from '../core/llm-runtime.js';
import { resolveModel } from './registry.js';

export class AiSdkLlmRuntime implements LlmRuntime {
  async generate(request: LlmRuntimeRequest): Promise<LlmRuntimeResponse> {
    const model = resolveModel(request.modelSpec);
    const result = await generateText({
      model,
      system: request.systemPrompt,
      prompt: request.prompt,
      tools: request.tools,
    });

    return { text: result.text };
  }
}

export function createAiSdkLlmRuntime(): LlmRuntime {
  return new AiSdkLlmRuntime();
}
