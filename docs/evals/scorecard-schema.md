# Demo Scorecard Schema (Stub)

## Purpose

Define a stable, machine-readable shape for demo and evaluation summaries.

This is an initial stub for milestone 0002 work. It captures the minimum shared contract so scripts, tests, and future CI aggregation can converge on one format.

## Status values

- `pass` — behavior met expected criteria.
- `review` — behavior is acceptable but needs human judgment or follow-up.
- `fail` — behavior violated expected criteria.
- `infra-flake` — run failed due to provider/transport/runtime infrastructure issues (not a model-policy failure).
- `not-run` — check not executed in this scenario.

## Top-level shape (draft)

```json
{
  "schemaVersion": "0.1",
  "runId": "2026-04-20T12:00:00.000Z-demo-abc123",
  "scenarioId": "briefing-steering-loop-v1",
  "milestone": "0002",
  "modelSpec": "openrouter:minimax/minimax-m2.7",
  "startedAt": "2026-04-20T12:00:00.000Z",
  "finishedAt": "2026-04-20T12:00:45.000Z",
  "overall": "pass",
  "checks": {
    "briefing_emitted": {
      "status": "pass",
      "reason": "briefing statement emitted in governance scope"
    },
    "briefing_scope_valid": {
      "status": "pass",
      "reason": "scope_type=governance, scope_key matches admin room"
    },
    "steering_emitted": {
      "status": "review",
      "reason": "steering present but broad; no explicit tone constraint"
    },
    "steering_applied_in_prompt": {
      "status": "pass",
      "reason": "active steering text present in logged narrator prompt"
    },
    "post_steering_behavior_alignment": {
      "status": "review",
      "reason": "response partially follows direction; requires human judgment"
    }
  },
  "artifacts": {
    "statementIds": ["..."],
    "logRefs": ["..."]
  }
}
```

## Required fields (initial)

- `schemaVersion`
- `runId`
- `scenarioId`
- `milestone`
- `modelSpec`
- `startedAt`
- `finishedAt`
- `overall`
- `checks`

## Check entry contract (initial)

Each `checks.<checkName>` entry should include:

- `status` (one of status values above)
- `reason` (brief human-readable explanation)

Optional:

- `evidence` (statement IDs, scope keys, prompt snippets, etc.)

## Notes

- Keep scorecards append-only for auditability.
- If a run has both behavior concerns and provider failures, separate them across individual check statuses where possible.
- This schema will be tightened once milestone 0002 demo scripts emit JSON by default.
