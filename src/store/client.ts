import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export const pg = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(pg, { schema });
export type DB = typeof db;

export async function ping(): Promise<void> {
  await pg`select 1`;
}

export async function close(): Promise<void> {
  await pg.end({ timeout: 5 });
}
