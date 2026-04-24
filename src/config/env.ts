import { Type, type Static } from 'typebox';
import { config } from 'dotenv';
import { withValidation } from '../lib/typebox.js';

config();

const EnvSchema = withValidation(
  Type.Object({
    NODE_ENV: Type.Optional(
      Type.Union([Type.Literal('development'), Type.Literal('production'), Type.Literal('test')], {
        default: 'development',
      }),
    ),
    LOG_LEVEL: Type.Optional(
      Type.Union(
        [
          Type.Literal('trace'),
          Type.Literal('debug'),
          Type.Literal('info'),
          Type.Literal('warn'),
          Type.Literal('error'),
          Type.Literal('fatal'),
        ],
        { default: 'info' },
      ),
    ),
    DATABASE_URL: Type.String({ minLength: 1 }),
    API_PORT: Type.Optional(Type.Integer({ minimum: 1, default: 3000 })),
    OPENROUTER_API_KEY: Type.Optional(Type.String()),
    ANTHROPIC_API_KEY: Type.Optional(Type.String()),
    OPENAI_API_KEY: Type.Optional(Type.String()),
    LOCAL_MODEL_PROVIDER: Type.Optional(Type.String({ default: 'local' })),
    LOCAL_MODEL_BASE_URL: Type.Optional(Type.String()),
    LOCAL_MODEL_API_KEY: Type.Optional(Type.String()),
    LOCAL_MODEL_CONTEXT_WINDOW: Type.Optional(Type.Integer({ minimum: 1, default: 131072 })),
    LOCAL_MODEL_MAX_TOKENS: Type.Optional(Type.Integer({ minimum: 1, default: 8192 })),
    LOCAL_MODEL_REASONING: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], { default: '0' }),
    ),
    EMBED_MODEL: Type.Optional(Type.String({ default: 'text-embedding-3-small' })),
    EMBED_DIM: Type.Optional(Type.Integer({ minimum: 1, default: 1536 })),
    LONG_CONTENT_WARN_CHARS: Type.Optional(Type.Integer({ minimum: 1, default: 6000 })),
    DISCORD_BOT_TOKEN: Type.Optional(Type.String()),
    DEFAULT_MODEL_SPEC: Type.Optional(Type.String()),
    LOG_DB_NOTICES: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], { default: '0' }),
    ),
    LOG_LLM_INPUT: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], { default: '0' }),
    ),
  }),
);

type ParsedEnv = Static<typeof EnvSchema>;

export type Env = {
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  DATABASE_URL: string;
  API_PORT: number;
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  LOCAL_MODEL_PROVIDER: string;
  LOCAL_MODEL_BASE_URL?: string;
  LOCAL_MODEL_API_KEY?: string;
  LOCAL_MODEL_CONTEXT_WINDOW: number;
  LOCAL_MODEL_MAX_TOKENS: number;
  LOCAL_MODEL_REASONING: boolean;
  EMBED_MODEL: string;
  EMBED_DIM: number;
  LONG_CONTENT_WARN_CHARS: number;
  DISCORD_BOT_TOKEN?: string;
  DEFAULT_MODEL_SPEC?: string;
  LOG_DB_NOTICES: boolean;
  LOG_LLM_INPUT: boolean;
};

const parsed = EnvSchema.parse({
  ...process.env,
  API_PORT: process.env.API_PORT ? Number(process.env.API_PORT) : undefined,
  EMBED_DIM: process.env.EMBED_DIM ? Number(process.env.EMBED_DIM) : undefined,
  LOCAL_MODEL_CONTEXT_WINDOW: process.env.LOCAL_MODEL_CONTEXT_WINDOW
    ? Number(process.env.LOCAL_MODEL_CONTEXT_WINDOW)
    : undefined,
  LOCAL_MODEL_MAX_TOKENS: process.env.LOCAL_MODEL_MAX_TOKENS
    ? Number(process.env.LOCAL_MODEL_MAX_TOKENS)
    : undefined,
  LONG_CONTENT_WARN_CHARS: process.env.LONG_CONTENT_WARN_CHARS
    ? Number(process.env.LONG_CONTENT_WARN_CHARS)
    : undefined,
});

export const env: Env = {
  NODE_ENV: parsed.NODE_ENV ?? 'development',
  LOG_LEVEL: parsed.LOG_LEVEL ?? 'info',
  DATABASE_URL: parsed.DATABASE_URL,
  API_PORT: parsed.API_PORT ?? 3000,
  OPENROUTER_API_KEY: parsed.OPENROUTER_API_KEY,
  ANTHROPIC_API_KEY: parsed.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: parsed.OPENAI_API_KEY,
  LOCAL_MODEL_PROVIDER: parsed.LOCAL_MODEL_PROVIDER ?? 'local',
  LOCAL_MODEL_BASE_URL: parsed.LOCAL_MODEL_BASE_URL,
  LOCAL_MODEL_API_KEY: parsed.LOCAL_MODEL_API_KEY,
  LOCAL_MODEL_CONTEXT_WINDOW: parsed.LOCAL_MODEL_CONTEXT_WINDOW ?? 131072,
  LOCAL_MODEL_MAX_TOKENS: parsed.LOCAL_MODEL_MAX_TOKENS ?? 8192,
  LOCAL_MODEL_REASONING: parsed.LOCAL_MODEL_REASONING === '1',
  EMBED_MODEL: parsed.EMBED_MODEL ?? 'text-embedding-3-small',
  EMBED_DIM: parsed.EMBED_DIM ?? 1536,
  LONG_CONTENT_WARN_CHARS: parsed.LONG_CONTENT_WARN_CHARS ?? 6000,
  DISCORD_BOT_TOKEN: parsed.DISCORD_BOT_TOKEN,
  DEFAULT_MODEL_SPEC: parsed.DEFAULT_MODEL_SPEC,
  LOG_DB_NOTICES: parsed.LOG_DB_NOTICES === '1',
  LOG_LLM_INPUT: parsed.LOG_LLM_INPUT === '1',
};
