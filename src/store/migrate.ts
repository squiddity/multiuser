import { client, pragmas } from './client.js';

export async function migrate(): Promise<void> {
  await pragmas();

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS statements (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL,
      scope_key TEXT,
      kind TEXT NOT NULL,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      ic_ooc TEXT,
      created_at INTEGER NOT NULL,
      supersedes TEXT,
      sources TEXT NOT NULL DEFAULT '[]',
      content TEXT NOT NULL,
      fields TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS statements_scope_idx
      ON statements (scope_type, scope_key, created_at);
    CREATE INDEX IF NOT EXISTS statements_kind_idx ON statements (kind);
    CREATE INDEX IF NOT EXISTS statements_supersedes_idx ON statements (supersedes);

    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_key TEXT,
      fields TEXT NOT NULL DEFAULT '{}',
      primary_statement_id TEXT REFERENCES statements(id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      binding TEXT NOT NULL,
      oversight_of TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      archived_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      definition TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_grants (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      role_id TEXT NOT NULL REFERENCES roles(id),
      granted_at INTEGER NOT NULL,
      granted_by TEXT NOT NULL,
      precedence INTEGER NOT NULL DEFAULT 0,
      revoked_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS role_grants_user_room_idx ON role_grants (user_id, room_id);

    CREATE TABLE IF NOT EXISTS mappings (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      fields TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      supersedes TEXT
    );

    CREATE INDEX IF NOT EXISTS mappings_kind_source_idx ON mappings (kind, source_id);
    CREATE INDEX IF NOT EXISTS mappings_platform_idx ON mappings (platform, platform_id);

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      worker_name TEXT NOT NULL,
      trigger TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      webhook_id TEXT NOT NULL,
      webhook_token TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}
