import { pg } from './client.js';
import { env } from '../config/env.js';

/**
 * Idempotent tier-0 schema installer. Matches src/store/schema.ts.
 * Swap to drizzle-kit migrations once we start evolving the schema.
 */
export async function migrate(): Promise<void> {
  const dim = env.EMBED_DIM;

  await pg.unsafe(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS statements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope_type TEXT NOT NULL,
      scope_key TEXT,
      kind TEXT NOT NULL,
      author_type TEXT NOT NULL,
      author_id TEXT NOT NULL,
      ic_ooc TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      supersedes UUID,
      sources UUID[] NOT NULL DEFAULT '{}'::uuid[],
      content TEXT NOT NULL,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      embedding VECTOR(${dim})
    );
    CREATE INDEX IF NOT EXISTS statements_scope_idx
      ON statements (scope_type, scope_key, created_at);
    CREATE INDEX IF NOT EXISTS statements_kind_idx ON statements (kind);
    CREATE INDEX IF NOT EXISTS statements_supersedes_idx ON statements (supersedes);

    CREATE TABLE IF NOT EXISTS entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_key TEXT,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      primary_statement_id UUID REFERENCES statements(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      binding JSONB NOT NULL,
      oversight_of UUID[] NOT NULL DEFAULT '{}'::uuid[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      definition JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_grants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      room_id UUID NOT NULL REFERENCES rooms(id),
      role_id UUID NOT NULL REFERENCES roles(id),
      granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      granted_by TEXT NOT NULL,
      precedence INTEGER NOT NULL DEFAULT 0,
      revoked_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS role_grants_user_room_idx ON role_grants (user_id, room_id);

    CREATE TABLE IF NOT EXISTS mappings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      kind TEXT NOT NULL,
      source_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      platform_id TEXT NOT NULL,
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      supersedes UUID
    );
    CREATE INDEX IF NOT EXISTS mappings_kind_source_idx ON mappings (kind, source_id);
    CREATE INDEX IF NOT EXISTS mappings_platform_idx ON mappings (platform, platform_id);

    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_name TEXT NOT NULL,
      trigger JSONB NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      webhook_id TEXT NOT NULL,
      webhook_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Seed initial data for Milestone 0001: Vertical Slice
    -- Insert party-1 and admin-1 rooms if they don't exist
    INSERT INTO rooms (id, name, binding, oversight_of, created_at)
    VALUES 
      ('11111111-1111-1111-1111-111111111111', 'party-1', '{"writeTarget":{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"},"readSet":[{"type":"world"},{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"},{"type":"character"}],"emitSet":[{"type":"world"}]}'::jsonb, '{}'::uuid[], now())
      ON CONFLICT (id) DO NOTHING,
      
      ('22222222-2222-2222-2222-222222222222', 'admin-1', '{"writeTarget":{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},"readSet":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},{"type":"meta","roomId":"22222222-2222-2222-2222-222222222222"}],"emitSet":[]}'::jsonb, '{}'::uuid[], now())
      ON CONFLICT (id) DO NOTHING;

    -- Insert player and gm roles if they don't exist
    INSERT INTO roles (id, name, definition)
    VALUES 
      ('33333333-3333-3333-3333-333333333333', 'player', '{"readScopes":[{"type":"world"},{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"}],"writeScopes":[{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"}],"capabilities":["act:say","act:roll","act:pause"],"narrativeAttributes":[]}'::jsonb)
      ON CONFLICT (id) DO NOTHING,
      
      ('44444444-4444-4444-4444-444444444444', 'gm', '{"readScopes":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},{"type":"meta","roomId":"22222222-2222-2222-2222-222222222222"}],"writeScopes":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"}],"capabilities":["canonize","safety:review"],"narrativeAttributes":[]}'::jsonb)
      ON CONFLICT (id) DO NOTHING;

    -- Grant player role to a simulated user in party-1 room
    INSERT INTO role_grants (id, user_id, room_id, role_id, granted_at, granted_by, precedence)
    VALUES 
      ('55555555-5555-5555-5555-555555555555', 'simulated-user-1', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', now(), 'system', 0)
      ON CONFLICT (id) DO NOTHING;

    -- Grant gm role to a simulated user in admin-1 room
    INSERT INTO role_grants (id, user_id, room_id, role_id, granted_at, granted_by, precedence)
    VALUES 
      ('66666666-6666-6666-6666-666666666666', 'simulated-user-2', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', now(), 'system', 0)
      ON CONFLICT (id) DO NOTHING;
  `);
}
