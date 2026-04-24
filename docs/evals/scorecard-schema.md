# Demo Scorecard Schema

## Purpose

Define a stable, machine-readable shape for demo and evaluation summaries.

This is the milestone 0002 demo reporting contract used by the CLI demo driver. It captures the shared JSON shape so scripts, tests, and future CI aggregation can consume demo outcomes without scraping human-readable logs.

## Status values

- `pass` — behavior met expected criteria.
- `review` — behavior is acceptable but needs human judgment or follow-up.
- `fail` — behavior violated expected criteria.
- `infra-flake` — run failed due to provider/transport/runtime infrastructure issues (not a model-policy failure).
- `not-run` — check not executed in this scenario.

## Top-level shape

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

## Required fields

- `schemaVersion`
- `runId`
- `scenarioId`
- `milestone`
- `modelSpec`
- `startedAt`
- `finishedAt`
- `overall`
- `checks`

## Check entry contract

Each `checks.<checkName>` entry should include:

- `status` (one of status values above)
- `reason` (brief human-readable explanation)

Optional:

- `evidence` (statement IDs, scope keys, prompt snippets, etc.)

## Milestone 0002 checks

Milestone 0002 demo scorecards use these check names:

- `briefing_emitted` — a briefing statement exists and includes source linkage.
- `briefing_scope_valid` — the briefing is written to governance/admin scope and binds the expected party/admin room IDs.
- `steering_emitted` — a structured active steering statement exists with source linkage.
- `steering_applied_in_prompt` — logged narrator input includes active steering context when prompt logging is enabled.
- `post_steering_behavior_alignment` — the post-steering narrator output reflects the requested direction. This can be `review` when qualitative judgment is required.

A scenario-specific run may mark checks that it does not exercise as `not-run`. Provider, transport, timeout, quota, and runtime failures should be classified as `infra-flake` rather than `fail` when behavior cannot be evaluated.

## Notes

- Keep scorecards append-only for auditability.
- If a run has both behavior concerns and provider failures, separate them across individual check statuses where possible.
- The CLI demo driver emits the machine-readable JSON as a single line prefixed with `[demo-scorecard]`.
