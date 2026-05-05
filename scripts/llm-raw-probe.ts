#!/usr/bin/env tsx
import 'dotenv/config';
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel, type AssistantMessage } from '@mariozechner/pi-ai';
import { env } from '../src/config/env.js';

function parseModelSpec(spec: string): { provider: string; modelId: string } {
  const idx = spec.indexOf(':');
  if (idx < 0) throw new Error(`invalid model spec: ${spec}`);
  return { provider: spec.slice(0, idx), modelId: spec.slice(idx + 1) };
}

function resolveModel(spec: string) {
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
    } as const;
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
    } as const;
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

function makeText(chars: number, seed: string): string {
  if (chars <= 0) return '';
  const chunk = `${seed} `;
  return chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars);
}

type ProbeVariant = {
  name: string;
  systemPrompt: string;
  prompt: string;
};

function buildVariants(): ProbeVariant[] {
  const context = makeText(
    Number(process.env.LLM_RAW_PROBE_CONTEXT_CHARS ?? '300'),
    'context-token',
  );
  const user = makeText(Number(process.env.LLM_RAW_PROBE_USER_CHARS ?? '80'), 'user-token');
  return [
    {
      name: 'json-default',
      systemPrompt:
        'You are a JSON-only test assistant. Respond with {"ok":true,"answer":"..."} and nothing else.',
      prompt: `## Context\n${context || '(none)'}\n\n## Instruction\nAnswer with JSON only. Confirm whether the context mentions context-token.\n\n## User input\n${user || '(none)'}`,
    },
    {
      name: 'plain-short',
      systemPrompt: 'You are a concise assistant. Reply in one short sentence.',
      prompt: 'What color is the sky on a clear day?',
    },
    {
      name: 'no-system-json',
      systemPrompt: '',
      prompt: 'Return exactly this JSON shape and nothing else: {"ok":true,"answer":"hello"}',
    },
  ];
}

async function main(): Promise<void> {
  let failures = 0;
  const modelSpec = process.env.LLM_RAW_PROBE_MODEL_SPEC?.trim() || env.DEFAULT_MODEL_SPEC;
  if (!modelSpec) throw new Error('LLM_RAW_PROBE_MODEL_SPEC or DEFAULT_MODEL_SPEC is required');

  const only = process.env.LLM_RAW_PROBE_VARIANT?.trim();
  const variants = buildVariants().filter((v) => (!only ? true : v.name === only));
  if (variants.length === 0) throw new Error(`No variants matched ${only}`);

  const { provider } = parseModelSpec(modelSpec);
  const model = resolveModel(modelSpec);

  console.log(
    JSON.stringify({
      event: 'raw-probe.start',
      modelSpec,
      variantCount: variants.length,
      llmCallTimeoutMs: env.LLM_CALL_TIMEOUT_MS,
    }),
  );

  for (const variant of variants) {
    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: variant.systemPrompt,
        tools: [],
      },
      getApiKey: () => resolveApiKey(provider),
    });

    const startedAt = Date.now();
    console.log(
      JSON.stringify({
        event: 'raw-probe.call.start',
        variant: variant.name,
        systemPromptChars: variant.systemPrompt.length,
        promptChars: variant.prompt.length,
      }),
    );

    try {
      await Promise.race([
        agent.prompt(variant.prompt),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`raw probe timed out after ${env.LLM_CALL_TIMEOUT_MS}ms`)),
            env.LLM_CALL_TIMEOUT_MS,
          ),
        ),
      ]);

      const assistantMessages = agent.state.messages.filter(
        (msg): msg is AssistantMessage => msg.role === 'assistant',
      );
      const lastAssistant = assistantMessages.at(-1);
      const contentBlocks = lastAssistant?.content ?? [];
      const textBlocks = contentBlocks.filter((b: any) => b.type === 'text');
      const text = textBlocks.map((b: any) => b.text).join('');

      const stopReason = (lastAssistant as any)?.stopReason;
      const errorMessage = (lastAssistant as any)?.errorMessage;
      const payload = {
        event: 'raw-probe.call.result',
        variant: variant.name,
        elapsedMs: Date.now() - startedAt,
        assistantMessageCount: assistantMessages.length,
        lastAssistantRole: lastAssistant?.role,
        blockTypes: contentBlocks.map((b: any) => b.type),
        responseChars: text.length,
        emptyText: text.trim().length === 0,
        stopReason,
        errorMessage,
        textPreview: text.slice(0, 240),
        rawLastAssistant: lastAssistant ?? null,
        tailMessages: agent.state.messages.slice(-3),
      };
      console.log(JSON.stringify(payload));

      if (stopReason === 'error' || errorMessage) {
        failures += 1;
        console.log(
          JSON.stringify({
            event: 'raw-probe.call.fail-fast',
            variant: variant.name,
            stopReason,
            errorMessage,
          }),
        );
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures += 1;
      console.log(
        JSON.stringify({
          event: 'raw-probe.call.error',
          variant: variant.name,
          elapsedMs: Date.now() - startedAt,
          error: message,
          tailMessages: agent.state.messages.slice(-3),
        }),
      );
      break;
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(JSON.stringify({ event: 'raw-probe.fatal', error: message }));
  process.exit(1);
});
