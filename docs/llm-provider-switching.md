# LLM Provider Switching Notes

## Purpose

Track known-working model specs and preserve the previous default so local/dev sessions can switch between providers safely.

## Previous local default (before OpenRouter switch tests)

- `DEFAULT_MODEL_SPEC=local:user.Qwen3.6-35B-A3B-ThinkingCoder`

## OpenRouter probe results (same pi runtime path)

- `openrouter:openai/gpt-4o-mini` — returns valid text response.
- `openrouter:deepseek/deepseek-chat` — returns valid text response.
- `openrouter:deepseek/deepseek-r1` — returned empty text in current runtime path.
- `openrouter:deepseek/deepseek-v4-pro` — returned empty text in current runtime path.

## Candidate under test

- `openrouter:deepseek/deepseek-v4-flash`

## Quick switch examples

Use one-off env override:

```bash
DEFAULT_MODEL_SPEC=openrouter:deepseek/deepseek-v4-flash pnpm demo:cli
```

Restore previous local default:

```bash
DEFAULT_MODEL_SPEC=local:user.Qwen3.6-35B-A3B-ThinkingCoder pnpm demo:cli
```
