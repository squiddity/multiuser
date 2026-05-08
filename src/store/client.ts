import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { env } from '../config/env.js';
import * as schema from './schema.js';

export const client = createClient({ url: env.SQLITE_URL });
export const db = drizzle(client, { schema });
export type DB = typeof db;

export async function ping(): Promise<void> {
  await client.execute('SELECT 1');
}

export async function close(): Promise<void> {
  client.close();
}

export async function pragmas(): Promise<void> {
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
}
