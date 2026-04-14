import { z } from 'zod';
import { config } from 'dotenv';

config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3000),
  OPENROUTER_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  EMBED_MODEL: z.string().default('text-embedding-3-small'),
  EMBED_DIM: z.coerce.number().int().positive().default(1536),
  LONG_CONTENT_WARN_CHARS: z.coerce.number().int().positive().default(6000),
  DISCORD_BOT_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
