import { describe, expect, it } from 'vitest';
import {
  BriefingStatementContract,
  SteeringStatementContract,
  selectActiveSteering,
} from '../../src/core/briefing-steering.js';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const SOURCE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('briefing contract', () => {
  it('accepts valid briefing payload', () => {
    const parsed = BriefingStatementContract.parse({
      kind: 'briefing',
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      content: 'The party negotiated safe passage through the marsh lights.',
      sources: [SOURCE_ID],
      fields: {
        partyRoomId: PARTY_ROOM_ID,
        adminRoomId: ADMIN_ROOM_ID,
        sourceIds: [SOURCE_ID],
        windowStart: '2026-04-20T12:00:00.000Z',
        windowEnd: '2026-04-20T12:05:00.000Z',
        unresolved: [{ question: 'Who warned the ferryman?', relatedSourceIds: [SOURCE_ID] }],
      },
    });

    expect(parsed.kind).toBe('briefing');
    expect(parsed.fields.unresolved).toHaveLength(1);
  });

  it('rejects briefing without provenance source ids', () => {
    expect(() =>
      BriefingStatementContract.parse({
        kind: 'briefing',
        scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
        content: 'Missing source links.',
        sources: [],
        fields: {
          partyRoomId: PARTY_ROOM_ID,
          adminRoomId: ADMIN_ROOM_ID,
          sourceIds: [],
          windowStart: '2026-04-20T12:00:00.000Z',
          windowEnd: '2026-04-20T12:05:00.000Z',
          unresolved: [],
        },
      }),
    ).toThrow();
  });
});

describe('steering contract', () => {
  it('accepts valid structured steering payload', () => {
    const parsed = SteeringStatementContract.parse({
      kind: 'steering',
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      content: 'Keep pressure high and avoid comic relief in the next exchange.',
      sources: [SOURCE_ID],
      fields: {
        appliesToPartyRoomId: PARTY_ROOM_ID,
        issuedByUserId: 'admin-user-1',
        intent: 'tone',
        tone: 'tense and ominous',
        constraints: ['no slapstick', 'keep scene focused on the gate sigil'],
        direction: 'Escalate urgency around the sigil before travel resumes.',
        status: 'active',
      },
    });

    expect(parsed.fields.status).toBe('active');
    expect(parsed.fields.constraints).toHaveLength(2);
  });

  it('rejects steering outside governance scope', () => {
    expect(() =>
      SteeringStatementContract.parse({
        kind: 'steering',
        scope: { type: 'party', partyId: PARTY_ROOM_ID },
        content: 'invalid scope',
        sources: [SOURCE_ID],
        fields: {
          appliesToPartyRoomId: PARTY_ROOM_ID,
          issuedByUserId: 'admin-user-1',
          intent: 'direction',
          constraints: [],
          direction: 'Do something',
          status: 'active',
        },
      }),
    ).toThrow();
  });
});

describe('active steering precedence', () => {
  it('orders active steering newest-first and filters inactive', () => {
    const ordered = selectActiveSteering([
      {
        id: 's-old-active',
        createdAt: '2026-04-20T12:00:00.000Z',
        fields: {
          appliesToPartyRoomId: PARTY_ROOM_ID,
          issuedByUserId: 'gm',
          intent: 'direction',
          constraints: [],
          direction: 'Old direction',
          status: 'active',
        },
      },
      {
        id: 's-new-active',
        createdAt: '2026-04-20T12:10:00.000Z',
        fields: {
          appliesToPartyRoomId: PARTY_ROOM_ID,
          issuedByUserId: 'gm',
          intent: 'direction',
          constraints: [],
          direction: 'New direction',
          status: 'active',
        },
      },
      {
        id: 's-superseded',
        createdAt: '2026-04-20T12:12:00.000Z',
        fields: {
          appliesToPartyRoomId: PARTY_ROOM_ID,
          issuedByUserId: 'gm',
          intent: 'direction',
          constraints: [],
          direction: 'Ignore me',
          status: 'superseded',
        },
      },
    ]);

    expect(ordered.map((s) => s.id)).toEqual(['s-new-active', 's-old-active']);
  });
});
