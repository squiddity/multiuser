import { describe, expect, it } from 'vitest';
import {
  BriefingStatementContract,
  SteeringStatementContract,
  selectActiveSteering,
} from '../../src/core/briefing-steering.js';
import {
  briefingGenerationFixture,
  steeringApplicationFixture,
} from '../fixtures/briefing-steering.js';

describe('milestone 0002 deterministic fixtures', () => {
  it('keeps briefing fixture contract-valid and source-linked', () => {
    const parsed = BriefingStatementContract.parse(briefingGenerationFixture.expectedBriefing);

    expect(parsed.sources).toEqual(briefingGenerationFixture.expectedBriefing.fields.sourceIds);
    expect(parsed.fields.windowStart).toBe(briefingGenerationFixture.windowStart);
    expect(parsed.fields.windowEnd).toBe(briefingGenerationFixture.windowEnd);
  });

  it('keeps steering fixture contract-valid', () => {
    const parsed = SteeringStatementContract.parse(
      steeringApplicationFixture.expectedSteeringStatement,
    );

    expect(parsed.fields.status).toBe('active');
    expect(parsed.fields.constraints).toContain('No slapstick');
  });

  it('keeps active steering fixture order deterministic', () => {
    const ordered = selectActiveSteering(steeringApplicationFixture.steeringCandidates);

    expect(ordered.map((s) => s.id)).toEqual(steeringApplicationFixture.expectedActiveOrder);
  });
});
