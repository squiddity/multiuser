import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { env } from '../config/env.js';

export const openrouter = env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: env.OPENROUTER_API_KEY })
  : null;

export const anthropic = env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

export const openai = env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: env.OPENAI_API_KEY })
  : null;
