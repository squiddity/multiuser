import type { SteeringCandidate } from '../../src/core/briefing-steering.js';

export const FIXTURE_IDS = {
  partyRoomId: '11111111-1111-1111-1111-111111111111',
  adminRoomId: '22222222-2222-2222-2222-222222222222',
  sourceA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sourceB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  steeringSource: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
} as const;

export const briefingGenerationFixture = {
  scenarioId: 'briefing-generation-v1',
  windowStart: '2026-04-20T12:00:00.000Z',
  windowEnd: '2026-04-20T12:05:00.000Z',
  partyInputs: [
    {
      id: FIXTURE_IDS.sourceA,
      kind: 'dialogue',
      content: 'The ferryman says no one crosses after moonrise unless paid in silver.',
    },
    {
      id: FIXTURE_IDS.sourceB,
      kind: 'pose',
      content: 'Mara reveals a hidden sigil etched into the skiff rail.',
    },
  ],
  expectedBriefing: {
    kind: 'briefing' as const,
    scope: { type: 'governance' as const, roomId: FIXTURE_IDS.adminRoomId },
    content:
      'Party uncovered a ferryman toll condition and a hidden sigil; unresolved risk is who warned the ferryman ahead of arrival.',
    sources: [FIXTURE_IDS.sourceA, FIXTURE_IDS.sourceB],
    fields: {
      partyRoomId: FIXTURE_IDS.partyRoomId,
      adminRoomId: FIXTURE_IDS.adminRoomId,
      sourceIds: [FIXTURE_IDS.sourceA, FIXTURE_IDS.sourceB],
      windowStart: '2026-04-20T12:00:00.000Z',
      windowEnd: '2026-04-20T12:05:00.000Z',
      unresolved: [
        {
          question: 'Who warned the ferryman before the party arrived?',
          relatedSourceIds: [FIXTURE_IDS.sourceA],
        },
      ],
    },
  },
} as const;

export const steeringApplicationFixture = {
  scenarioId: 'steering-application-v1',
  expectedActiveOrder: ['s-new-active', 's-old-active'],
  expectedPromptSnippets: ['tense and ominous', 'No slapstick'],
  expectedSteeringStatement: {
    kind: 'steering' as const,
    scope: { type: 'governance' as const, roomId: FIXTURE_IDS.adminRoomId },
    content: 'Keep pressure high and avoid comic relief in the next scene at the gate.',
    sources: [FIXTURE_IDS.steeringSource],
    fields: {
      appliesToPartyRoomId: FIXTURE_IDS.partyRoomId,
      issuedByUserId: 'admin-user-1',
      intent: 'tone' as const,
      tone: 'tense and ominous',
      constraints: ['No slapstick', 'Keep focus on the gate sigil'],
      direction: 'Escalate urgency before travel resumes.',
      status: 'active' as const,
    },
  },
  steeringCandidates: [
    {
      id: 's-old-active',
      createdAt: '2026-04-20T12:00:00.000Z',
      fields: {
        appliesToPartyRoomId: FIXTURE_IDS.partyRoomId,
        issuedByUserId: 'gm',
        intent: 'direction' as const,
        constraints: [],
        direction: 'Old direction',
        status: 'active' as const,
      },
    },
    {
      id: 's-new-active',
      createdAt: '2026-04-20T12:10:00.000Z',
      fields: {
        appliesToPartyRoomId: FIXTURE_IDS.partyRoomId,
        issuedByUserId: 'gm',
        intent: 'tone' as const,
        tone: 'tense and ominous',
        constraints: ['No slapstick'],
        direction: 'Raise pressure now',
        status: 'active' as const,
      },
    },
    {
      id: 's-superseded',
      createdAt: '2026-04-20T12:12:00.000Z',
      fields: {
        appliesToPartyRoomId: FIXTURE_IDS.partyRoomId,
        issuedByUserId: 'gm',
        intent: 'direction' as const,
        constraints: [],
        direction: 'Ignore this',
        status: 'superseded' as const,
      },
    },
  ] satisfies SteeringCandidate[],
} as const;
