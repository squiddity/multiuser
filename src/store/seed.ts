import { pg } from './client.js';

// Dev seed for Milestone 0001. Safe to call repeatedly (ON CONFLICT DO NOTHING).
// Separated from migrate() so tests/prod can run schema without the fixture.
export async function seed(): Promise<void> {
  await pg.unsafe(`
    INSERT INTO rooms (id, name, binding, oversight_of, created_at)
    VALUES ('11111111-1111-1111-1111-111111111111', 'party-1', '{"writeTarget":{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"},"readSet":[{"type":"world"},{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"},{"type":"character"}],"emitSet":[{"type":"world"}]}'::jsonb, '{}'::uuid[], now())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pg.unsafe(`
    INSERT INTO rooms (id, name, binding, oversight_of, created_at)
    VALUES ('22222222-2222-2222-2222-222222222222', 'admin-1', '{"writeTarget":{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},"readSet":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},{"type":"meta","roomId":"22222222-2222-2222-2222-222222222222"}],"emitSet":[]}'::jsonb, '{}'::uuid[], now())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pg.unsafe(`
    INSERT INTO roles (id, name, definition)
    VALUES ('33333333-3333-3333-3333-333333333333', 'player', '{"readScopes":[{"type":"world"},{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"}],"writeScopes":[{"type":"party","partyId":"11111111-1111-1111-1111-111111111111"}],"capabilities":["act:say","act:roll","act:pause"],"narrativeAttributes":[]}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);

  await pg.unsafe(`
    INSERT INTO roles (id, name, definition)
    VALUES ('44444444-4444-4444-4444-444444444444', 'gm', '{"readScopes":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"},{"type":"meta","roomId":"22222222-2222-2222-2222-222222222222"}],"writeScopes":[{"type":"governance","roomId":"22222222-2222-2222-2222-222222222222"}],"capabilities":["canonize","safety:review"],"narrativeAttributes":[]}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);

  await pg.unsafe(`
    INSERT INTO role_grants (id, user_id, room_id, role_id, granted_at, granted_by, precedence)
    VALUES ('55555555-5555-5555-5555-555555555555', 'simulated-user-1', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', now(), 'system', 0)
    ON CONFLICT (id) DO NOTHING;
  `);

  await pg.unsafe(`
    INSERT INTO role_grants (id, user_id, room_id, role_id, granted_at, granted_by, precedence)
    VALUES ('66666666-6666-6666-6666-666666666666', 'simulated-user-2', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', now(), 'system', 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}
