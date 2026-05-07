# LLM Provider Switching Notes

## Purpose

Track known-working model specs and preserve the previous default so local/dev sessions can switch between providers safely.

## Current default for demos and bot runs

- `DEFAULT_MODEL_SPEC=openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5`

## Fallback recommendation

- `DEFAULT_MODEL_SPEC=openrouter:openai/gpt-4o-mini`

## OpenRouter probe results (same pi runtime path)

- `openrouter:openai/gpt-4o-mini` — returns valid text response.
- `openrouter:deepseek/deepseek-chat` — returns valid text response.
- `openrouter:deepseek/deepseek-r1` — returned empty text in current runtime path.
- `openrouter:deepseek/deepseek-v4-pro` — returned empty text in current runtime path.

## Current recommendation

- `openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5` — current default for demo and Discord bot runs.
- `openrouter:openai/gpt-4o-mini` — preferred fallback when the default provider/model is degraded.

## Quick switch examples

Use one-off env override:

```bash
DEFAULT_MODEL_SPEC=openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5 pnpm demo:cli
```

Switch to fallback model:

```bash
DEFAULT_MODEL_SPEC=openrouter:openai/gpt-4o-mini pnpm demo:cli
```
