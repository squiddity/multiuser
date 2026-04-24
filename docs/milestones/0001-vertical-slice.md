# Milestone 0001 — Vertical Slice (Party + Admin)

## Goal

First interactive milestone: a headless CLI harness exercising two rooms (`party-1`, `admin-1`), core scope isolation (`party`, `governance`/`meta`), narrator response, and open-question + canonization flow end-to-end. Proves the domain pipeline before committing to richer mechanics and Discord UI plumbing.

## Status (2026-04-20)

**Milestone 0001 is closed.**

The required vertical slice is complete for state flow and admin canonization loops.

Deferred from this milestone into later roadmap work:

- Safety command surface (`/pause`, `/unpause`, `/fade`) and related runtime gating.
- Mechanical resolver dispatch path from live responder (`command-query`).
- Gameplay command surface such as `/roll` in the CLI harness.

## Scope

- **Rooms**: `party-1`, `admin-1`.
- **Scopes used**: `party:party-1` (read: world ∪ party ∪ character), `governance:admin-1` + `meta:admin-1`.
- **Roles**: `player` in party-1, `gm` in admin-1 (`canonize`).
- **Verbs**: `/say`, admin-only `/canonize <open-q-id> <decision>`.
- **Agents**: `narrator` (party), `decision-formalizer` (admin open-question decision path; historically named `steering-formalizer` during 0001 — renamed in milestone 0002 PR3 when the name was claimed by the steering workflow).
- **Workers**: `live-responder`, `open-question-resolver`.
- **Resolver**: `AgentBackedResolver` framework present; gameplay mechanics usage is deferred.
- **Harness**: CLI REPL with room switching and scripted demo driving.

Out of scope for this milestone: safety pause controls, full mechanics command path, Discord adapter UX validation, briefings/digests, consistency auditor, combat workflows.

## Ordered tasks and completion

1. **Room/role types + store.** ✅ Done.
2. **Scope-filtered retrieval.** ✅ Done.
3. **Embeddings + vector search substrate.** ✅ Done.
4. **Worker + scheduler interfaces.** ✅ Done.
5. **Model registry (`<provider>:<slug>`).** ✅ Done.
6. **Resolver agent framework + instructions-as-data pattern.** ✅ Done.
7. **Narrator agent emission path (`narration`/`pose`/`invention`).** ✅ Done.
8. **Live-responder event trigger path for party dialogue.** ✅ Done (mechanics dispatch deferred).
9. **Steering-formalizer + open-question-resolver application flow.** ✅ Done.
10. **`/canonize` verb and governance decision flow.** ✅ Done.
11. **CLI harness + scripted demo workflow.** ✅ Done.
12. **HTTP API surface + hermetic tests.** ✅ Done.

## Exit criteria (met)

- Integration coverage includes scope isolation, narrator roundtrip, open-question flow, canonize flow, and worker pipeline.
- Hermetic API tests pass (`pnpm test:api`).
- Scripted CLI demo proves: party statement → governance open-question/canon decision → subsequent party recall uses canonized state.
- Prompt assembly remains scope-aware and auditable.

## Deferred follow-on milestones

- **Milestone 0002**: admin/player context handling, briefing generation, and steering workflows.
- **Milestone 0003**: Discord adapter integration and end-to-end validation of prior milestone behavior in actual chat UX.
- **Milestone 0004**: RPG mechanics command path (`/roll`, mechanical resolver dispatch) and deferred command-surface items.

## Relationship to other docs

- `implementation.md` — first concrete runtime/store wiring.
- `rooms-and-roles.md` — role/scoping model exercised in minimal form.
- `runtime-and-processing.md` — initial workers and tier-0 scheduler behavior.
- `rules-resolution.md` — resolver interface foundation established.
