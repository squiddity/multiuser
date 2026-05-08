import { db } from './client.js';
import { rooms, roles, roleGrants } from './schema.js';

// Dev seed for Milestone 0001. Safe to call repeatedly (INSERT OR IGNORE).
export async function seed(): Promise<void> {
  const now = new Date();

  await db
    .insert(rooms)
    .values([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'party-1',
        binding: {
          writeTarget: { type: 'party', partyId: '11111111-1111-1111-1111-111111111111' },
          readSet: [
            { type: 'world' },
            { type: 'party', partyId: '11111111-1111-1111-1111-111111111111' },
            { type: 'character' },
          ],
          emitSet: [{ type: 'world' }],
        },
        oversightOf: [],
        createdAt: now,
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'admin-1',
        binding: {
          writeTarget: { type: 'governance', roomId: '22222222-2222-2222-2222-222222222222' },
          readSet: [
            { type: 'governance', roomId: '22222222-2222-2222-2222-222222222222' },
            { type: 'meta', roomId: '22222222-2222-2222-2222-222222222222' },
          ],
          emitSet: [],
        },
        oversightOf: [],
        createdAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(roles)
    .values([
      {
        id: '33333333-3333-3333-3333-333333333333',
        name: 'player',
        definition: {
          readScopes: [
            { type: 'world' },
            { type: 'party', partyId: '11111111-1111-1111-1111-111111111111' },
          ],
          writeScopes: [{ type: 'party', partyId: '11111111-1111-1111-1111-111111111111' }],
          capabilities: ['act:say', 'act:roll', 'act:pause'],
          narrativeAttributes: [],
        },
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        name: 'gm',
        definition: {
          readScopes: [
            { type: 'governance', roomId: '22222222-2222-2222-2222-222222222222' },
            { type: 'meta', roomId: '22222222-2222-2222-2222-222222222222' },
          ],
          writeScopes: [{ type: 'governance', roomId: '22222222-2222-2222-2222-222222222222' }],
          capabilities: ['canonize', 'safety:review'],
          narrativeAttributes: [],
        },
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(roleGrants)
    .values([
      {
        id: '55555555-5555-5555-5555-555555555555',
        userId: 'simulated-user-1',
        roomId: '11111111-1111-1111-1111-111111111111',
        roleId: '33333333-3333-3333-3333-333333333333',
        grantedAt: now,
        grantedBy: 'system',
        precedence: 0,
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        userId: 'simulated-user-2',
        roomId: '22222222-2222-2222-2222-222222222222',
        roleId: '44444444-4444-4444-4444-444444444444',
        grantedAt: now,
        grantedBy: 'system',
        precedence: 0,
      },
    ])
    .onConflictDoNothing();
}
