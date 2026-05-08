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
    SQLITE_URL: Type.Optional(Type.String({ default: 'file:./data/multiuser.sqlite' })),
    MEMORY_ROOT: Type.Optional(Type.String({ default: './data/memory' })),
    MEMSEARCH_BIN: Type.Optional(Type.String()),
    MEMSEARCH_CONFIG_DIR: Type.Optional(Type.String()),
    MEMSEARCH_EMBEDDING_PROVIDER: Type.Optional(
      Type.Union([Type.Literal('onnx'), Type.Literal('openai'), Type.Literal('ollama')], {
        default: 'onnx',
      }),
    ),
    MEMSEARCH_MILVUS_URI: Type.Optional(Type.String()),
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
    LONG_CONTENT_WARN_CHARS: Type.Optional(Type.Integer({ minimum: 1, default: 6000 })),
    DISCORD_BOT_TOKEN: Type.Optional(Type.String()),
    DISCORD_GUILD_ID: Type.Optional(Type.String()),
    DEFAULT_MODEL_SPEC: Type.Optional(Type.String()),
    LLM_CALL_TIMEOUT_MS: Type.Optional(Type.Integer({ minimum: 1000, default: 90000 })),
    ENABLE_BRIEFING_GENERATOR: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], { default: '1' }),
    ),
    LLM_SERIALIZE_CALLS: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], { default: '0' }),
    ),
    CACHE_RETENTION: Type.Optional(
      Type.Union([Type.Literal('short'), Type.Literal('long')], { default: 'short' }),
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
  SQLITE_URL: string;
  MEMORY_ROOT: string;
  MEMSEARCH_BIN?: string;
  MEMSEARCH_CONFIG_DIR?: string;
  MEMSEARCH_EMBEDDING_PROVIDER: 'onnx' | 'openai' | 'ollama';
  MEMSEARCH_MILVUS_URI?: string;
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
  LONG_CONTENT_WARN_CHARS: number;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DEFAULT_MODEL_SPEC?: string;
  LLM_CALL_TIMEOUT_MS: number;
  ENABLE_BRIEFING_GENERATOR: boolean;
  LLM_SERIALIZE_CALLS: boolean;
  CACHE_RETENTION: 'short' | 'long';
  LOG_LLM_INPUT: boolean;
};

const parsed = EnvSchema.parse({
  ...process.env,
  API_PORT: process.env.API_PORT ? Number(process.env.API_PORT) : undefined,
  LOCAL_MODEL_CONTEXT_WINDOW: process.env.LOCAL_MODEL_CONTEXT_WINDOW
    ? Number(process.env.LOCAL_MODEL_CONTEXT_WINDOW)
    : undefined,
  LOCAL_MODEL_MAX_TOKENS: process.env.LOCAL_MODEL_MAX_TOKENS
    ? Number(process.env.LOCAL_MODEL_MAX_TOKENS)
    : undefined,
  LONG_CONTENT_WARN_CHARS: process.env.LONG_CONTENT_WARN_CHARS
    ? Number(process.env.LONG_CONTENT_WARN_CHARS)
    : undefined,
  LLM_CALL_TIMEOUT_MS: process.env.LLM_CALL_TIMEOUT_MS
    ? Number(process.env.LLM_CALL_TIMEOUT_MS)
    : undefined,
});

function parseCacheRetention(val: string | undefined): 'short' | 'long' {
  if (val === 'long') return 'long';
  return 'short';
}

export const env: Env = {
  NODE_ENV: parsed.NODE_ENV ?? 'development',
  LOG_LEVEL: parsed.LOG_LEVEL ?? 'info',
  SQLITE_URL: parsed.SQLITE_URL ?? 'file:./data/multiuser.sqlite',
  MEMORY_ROOT: parsed.MEMORY_ROOT ?? './data/memory',
  MEMSEARCH_BIN: parsed.MEMSEARCH_BIN,
  MEMSEARCH_CONFIG_DIR: parsed.MEMSEARCH_CONFIG_DIR,
  MEMSEARCH_EMBEDDING_PROVIDER: parsed.MEMSEARCH_EMBEDDING_PROVIDER ?? 'onnx',
  MEMSEARCH_MILVUS_URI: parsed.MEMSEARCH_MILVUS_URI,
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
  LONG_CONTENT_WARN_CHARS: parsed.LONG_CONTENT_WARN_CHARS ?? 6000,
  DISCORD_BOT_TOKEN: parsed.DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID: parsed.DISCORD_GUILD_ID,
  DEFAULT_MODEL_SPEC: parsed.DEFAULT_MODEL_SPEC,
  LLM_CALL_TIMEOUT_MS: parsed.LLM_CALL_TIMEOUT_MS ?? 90000,
  ENABLE_BRIEFING_GENERATOR: parsed.ENABLE_BRIEFING_GENERATOR !== '0',
  LLM_SERIALIZE_CALLS: parsed.LLM_SERIALIZE_CALLS === '1',
  CACHE_RETENTION: parseCacheRetention(process.env.CACHE_RETENTION),
  LOG_LLM_INPUT: parsed.LOG_LLM_INPUT === '1',
};
