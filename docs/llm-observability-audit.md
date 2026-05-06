# LLM Observability & Performance Audit

## Purpose

Analyze what the pi AI agent framework provides for tracking LLM calls (tokens, cache, streaming, session identity) and what our application code currently ignores or does wrong. This audit drives milestone 0005 implementation.

## Status quo: what pi gives us vs. what we use

### 1. `AssistantMessage.usage` — token/cache/cost tracking (UNUSED)

pi-ai's `AssistantMessage` type (in every model response) includes a full `usage` block:

```ts
interface Usage {
  input: number; // input/prompt tokens
  output: number; // output/completion tokens
  cacheRead: number; // tokens read from cache (provider-dependent)
  cacheWrite: number; // tokens written to cache (provider-dependent)
  totalTokens: number; // sum
  cost: {
    input: number; // $ cost for input tokens
    output: number; // $ cost for output tokens
    cacheRead: number; // $ cost for cache reads
    cacheWrite: number; // $ cost for cache writes
    total: number; // total $ cost
  };
}
```

**Our code:** `pi-runtime.ts` extracts only `assistantText(lastAssistant)` and discards `lastAssistant.usage` entirely. We log only `promptChars` and `responseChars` — no token counts, no cache info, no cost.

### 2. `Agent.onPayload` callback — see what's sent (UNUSED)

The `Agent` constructor accepts `onPayload(payload, model)` — called with the serialized provider payload before it's sent. This lets us log or inspect the full request body including system prompt, messages, tools, thinking config, cache-control markers.

**Our code:** No `onPayload` callback passed.

### 3. `Agent.onResponse` callback — response headers (UNUSED)

The `Agent` constructor accepts `onResponse(response, model)` — called after HTTP response status+headers arrive. `ProviderResponse` gives `status` and `headers: Record<string, string>`. OpenRouter and Anthropic include cache-hit/miss headers here.

**Our code:** No `onResponse` callback passed.

### 4. `Agent.sessionId` — session-based caching (UNSET)

The `Agent` has a `sessionId` property. When set, it's forwarded to providers that support session-based prompt caching (OpenRouter, Anthropic). This is the **single most impactful change** for performance — without it, every request is cache-cold.

**Our code:** No `sessionId` set. A new `Agent` is created for _every single `generate()` call_, which also means no session state continuity.

### 5. `StreamOptions.cacheRetention` — cache lifetime (UNSET)

pi-ai's `StreamOptions` has `cacheRetention: "short" | "long"`. On Anthropic, "long" extends cache TTL from 5 minutes to 1 hour; on OpenAI, to 24 hours.

**Our code:** Not set. Defaults to provider default (likely no caching or short TTL).

### 6. `Agent.subscribe()` — streaming events (UNUSED)

`Agent.subscribe()` emits `message_update` events with `assistantMessageEvent` deltas (`text_delta`, `thinking_delta`, `toolcall_delta`). This lets us stream tokens to logs or a monitoring endpoint as they arrive.

**Our code:** Not used. `pi-runtime.ts` awaits `agent.prompt()` which buffers the full response, then extracts text from the final `AssistantMessage`.

### 7. `Model.cost` — per-model cost tables (HARDCODED TO ZERO)

pi-ai's `Model` type has `cost: { input, output, cacheRead, cacheWrite }` — per-million-token costs in USD. Our OpenRouter model definition sets all to `0`:

```ts
cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
```

This means even if we collected usage data, cost calculations would be wrong.

### 8. `Model.compat.openRouterRouting` — OpenRouter-specific options (NOT SET)

`openRouterRouting` lets us control provider selection: `allow_fallbacks`, `order`, `only`, `ignore`, `sort` (by price/throughput/latency), `max_price`, `preferred_min_throughput`, `preferred_max_latency`.

**Our code:** Not set. OpenRouter uses default routing.

### 9. `Model.compat.sendSessionAffinityHeaders` — OpenRouter session affinity (NOT SET)

When `true`, sends `session_id`, `x-client-request-id`, `x-session-affinity` headers. OpenRouter uses these to route to the same upstream provider, improving cache hit rates.

**Our code:** Not set.

### 10. `Model.compat.cacheControlFormat` — Anthropic-style cache control (NOT SET)

When `"anthropic"`, applies Anthropic-style `cache_control` markers to system prompt, last tool definition, and last text content. **Our code:** Not set.

## Current performance problems

### Problem A: No session identity → every request is cache-cold

Without a `sessionId` on the Agent, OpenRouter treats each request independently. Even if the narrator prompt's stable prefix (system prompt, world canon, room rules) is identical across turns, the provider never reuses cached results.

**Impact:** Every narrator turn pays full input token cost. On `deepseek/deepseek-v4-flash` with ~4K-6K input tokens per turn, this is the dominant latency factor.

### Problem B: Fresh Agent per request → no agent state continuity

Each `PiAiLlmRuntime.generate()` call creates a new `Agent`, calls `agent.prompt()`, extracts text, then discards the agent. This means:

- No conversation state accumulates across turns
- No opportunity for append-oriented session context
- Provider-side session caching sees a new session ID each time

### Problem C: No streaming → no early visibility

Without subscribing to Agent events, we can't show intermediate output (thinking tokens, partial text) to users or monitoring tools. Users see a blank "Thinking..." until the entire response arrives.

### Problem D: No structural context segmentation

The narrator `buildUserPrompt()` concatenates world canon, party experience, recent statements, active steering, and the player action into a single flat string. The stable prefix (system prompt + world canon + room rules) is rebuilt every turn as raw text, defeating any chance of prompt caching at the provider level.

### Problem E: No token rate measurement

Without extracting `usage.output` and `usage.input`, we cannot compute tokens-per-second. The only timing data we log is `elapsedMs`. This makes it impossible to diagnose whether slow responses are due to high latency, low throughput, or cache misses.

### Problem F: OpenRouter cost reporting is inaccurate

Even when OpenRouter returns a `cost` field in usage, our local `Model.cost` hardcode overrides it. pi-ai computes `usage.cost` from `Model.cost × usage token counts`, so with all costs set to 0, we get cost = 0 regardless of actual spend.

## What pi gives us that we can use immediately (zero-cost wins)

| Feature                             | pi API                                    | Current status | Effort to enable                  |
| ----------------------------------- | ----------------------------------------- | -------------- | --------------------------------- |
| Token+cache+usage telemetry         | `AssistantMessage.usage`                  | Ignored        | ~1h (extract + log)               |
| Provider payload inspection         | `Agent.onPayload`                         | Not set        | ~0.5h                             |
| Response headers (cache indicators) | `Agent.onResponse`                        | Not set        | ~0.5h                             |
| Session ID for cache affinity       | `Agent.sessionId`                         | Not set        | ~1h (generate stable ID per room) |
| Cache retention preference          | `StreamOptions.cacheRetention`            | Not set        | ~0.5h                             |
| OpenRouter session-affinity headers | `Model.compat.sendSessionAffinityHeaders` | Not set        | ~0.5h                             |
| OpenRouter routing preferences      | `Model.compat.openRouterRouting`          | Not set        | ~1h                               |
| Streaming text deltas               | `Agent.subscribe()`                       | Not used       | ~2h                               |
| Per-model cost                      | `Model.cost`                              | Hardcoded 0    | ~1h (set real costs)              |
| Thinking budgets                    | `thinkingBudgets`                         | Not set        | ~0.5h                             |

## What we need to build

| Feature                                    | Why                                                  | Est. effort |
| ------------------------------------------ | ---------------------------------------------------- | ----------- |
| Structured `LlmRuntimeResponse` with usage | Carry token/cache/cost data out of the runtime layer | ~2h         |
| Token-per-second measurement               | Diagnose provider throughput                         | ~1h         |
| Stable session identity per room/workflow  | Enable prompt caching across turns                   | ~3h         |
| Context assembler with stability tiers     | Structure prompts for max cache reuse                | ~8h         |
| Telemetry aggregation + log endpoint       | Live monitoring dashboard                            | ~4h         |
| Prompt cache evaluation harness            | Measure cache hit/miss rates                         | ~4h         |
| Correct OpenRouter model cost table        | Accurate cost tracking                               | ~1h         |

## Recommended implementation order

### Phase 1 (immediate, 1-2 sessions): Zero-cost wins

1. Instrument `PiAiLlmRuntime` to extract `usage` from responses and log it
2. Set `sessionId` on Agent (stable per room/workflow)
3. Add `onPayload`/`onResponse` callbacks to log full context and cache indicators
4. Set `cacheRetention: "long"` (or env-configurable)
5. Set `sendSessionAffinityHeaders: true` on OpenRouter model compat
6. Set real OpenRouter model costs
7. Add tokens-per-second measurement

### Phase 2 (3-4 sessions): Observable monitoring

1. Structured log event format for LLM calls
2. Dedicated `/llm-events` SSE endpoint for live monitoring
3. Agent that tails the endpoint for automated analysis

### Phase 3 (milestone 0005 core): Context assembly

1. Introduce `ContextAssembler` component with stability tiers
2. Migrate narrator prompt assembly to tiered model
3. Session-aware LLM runtime contract
4. Summary/compaction artifacts

### Phase 4: Validation

1. Efficiency telemetry and eval thresholds
2. Regression checks on grounding and scope isolation
