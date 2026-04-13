# Runtime, Scheduling & Processing Model

## Purpose

Define how the system is *executed*: which host runs the agent logic, where state lives, how live and scheduled work are dispatched, and how narrative consistency is measured. Complements `memory-model.md` (what is stored) and `rooms-and-roles.md` (who can read/write what) by specifying how statements are produced.

## Runtime choice

### Not the opencode plugin path

An opencode plugin inherits opencode's session shape (one user, one editing loop, one process). The application we're building is many users, many concurrent rooms, long-horizon persistence, and scheduled background processing. The fit is structurally wrong — plugin work becomes core rework. Rule out and move on.

### Use a thin agent runtime + own everything stateful

Short list:

- **Claude Agent SDK** — minimal. You bring your own state, scheduling, transport. Good if we want maximum control and minimum framework opinion.
- **LangGraph** (Python) — graph-based state machine; checkpointers persist graph state; multi-tenant patterns are idiomatic (thread-id keyed state, metadata filters on retrieval). Strong ergonomic fit for long-running, branching processes (party turn, briefing job, canonization proposer as distinct graphs sharing a store).
- **Mastra** (TypeScript) — workflows, threads, pluggable memory. Good if we want to stay in TS for closer alignment with Discord client libraries.

All three leave the statement store, the scheduler, and the eval harness to us. That's correct — those are the load-bearing pieces and we want them swappable.

Letta remains a candidate for memory, but its scope model is more opinionated than ours needs; re-evaluate only if our store design stalls.

## The statement store is the source of truth

Every output of the system — agent narration, player turn, GM ruling, briefing, steering, canonization, open question, interception record — is a **statement** (per `memory-model.md`). Statements are append-only, addressable by id, scope-tagged, provenance-linked.

Consequences:
- Agents are **stateless workers**. They read a scope-filtered slice, produce statements, write back. No in-memory session object survives across calls.
- "Respond in channel" and "run daily briefing" are the **same shape of process** with different triggers.
- Recovery is trivial: restart any worker, read the store, resume. No in-flight state to reconstitute.
- The store is the audit log and the replay substrate. Prompt reconstruction for any past turn is deterministic from statement ids.

Storage layers (implementation-agnostic):
- Append-only statement log (Postgres, SQLite to start).
- Vector index with metadata filters and per-scope namespaces (pgvector, Qdrant, LanceDB).
- Entity/graph store for canonical entities (Postgres with adjacency tables is fine; Neo4j if traversal complexity grows).
- Summary store keyed by (scope, window) with back-pointers to statements.

## Workers and triggers

Every activity in the system is a worker invocation keyed by a trigger. Taxonomy of workers:

- **Live responder** — a room received a user message; produce a response turn.
- **Briefing generator** — produce a scope-respecting digest for a target room.
- **Steering formalizer** — convert freeform GM messages into structured steering records.
- **Canonization proposer** — scan recent party inventions, propose promotions.
- **Consistency auditor** — extract entity claims from recent agent output, re-retrieve canon, flag contradictions.
- **Open-question resolver** — when a decision arrives from an authoring role, apply it to pending open questions and any dependent statements.
- **Summarizer** — produce running summaries per scope with back-pointers.
- **Interceptor** — run registered interceptions on flow records (see `rooms-and-roles.md`).

Triggers come in three flavors:

1. **Event** — a new statement matching a predicate was appended (e.g. new user message in a room; new open-question tagged `needs:wizard-cabal`).
2. **Schedule** — wall-clock time (e.g. daily 08:00 briefing for each active party).
3. **Signal** — an operator or an authoring role explicitly fires a worker (e.g. "regenerate Party C's briefing now").

All three use the same worker dispatch pipeline. The only thing that changes is the origin of the trigger event.

## Scheduling: easy out-of-box, upgrade to Temporal/Inngest later

Two scheduling needs:

- **Cron-like wall-clock firing** (daily briefings, hourly consistency sweeps).
- **Durable long-running workflows** (multi-step canonization with human approval; a briefing generation that spans retrieval, draft, interception chain, delivery).

Out of the box we want something trivial to run. As load, concurrency, and failure-recovery demands grow we should be able to swap in Temporal (or Inngest) without rewriting workers. The way to get both is to **abstract over a `Scheduler` interface** and treat wall-clock and workflow orchestration as two separate concerns that different backends may bundle.

### Scheduler abstraction

Minimum shape — concrete type names left to the language choice:

```
schedule(trigger_spec, worker_name, payload) -> schedule_id
cancel(schedule_id)
fire_now(worker_name, payload)
```

- `trigger_spec` covers cron expressions, one-shots, and "after N of event E" compound triggers.
- Workers register by name and are dispatched uniformly regardless of backend.
- Payload is the scope key and any free parameters; the worker fetches state from the statement store, not from the scheduler.

A second interface for durable workflows:

```
workflow_run(workflow_name, input) -> run_id
workflow_signal(run_id, name, payload)
workflow_query(run_id, name) -> value
```

Only a subset of workers need this (multi-step, approval-gated, multi-day). Pure cron firings don't.

### Backend tiers

| Tier | Wall-clock scheduler | Durable workflow | When to use |
|---|---|---|---|
| **0. In-process** | `node-cron` / `APScheduler` / `croner` | in-memory state machines, no durability | dev, single-instance, proving the model |
| **1. OS-native** | `systemd` timers invoking worker CLI | none | small prod, predictable load, operational simplicity |
| **2. Framework-native** | LangGraph Platform cron jobs; Mastra + scheduled workflows | framework's built-in workflow engine | when already committed to that framework's hosted runtime |
| **3. Dedicated services** | **Temporal** schedules; **Inngest** cron | Temporal workflows; Inngest step functions | concurrent volume, crash-safety, retries, long workflows, visibility |

The contract is: **workers don't know which tier fired them.** Moving from tier 0 to tier 3 is a config and deployment change, not a rewrite. This is why the scheduler is behind an interface and why worker state lives in the statement store rather than in the scheduler's memory.

### Why Temporal is worth designing toward

- **Durable execution.** A briefing workflow that retrieves, drafts, awaits an interception chain, and delivers can span minutes or hours; Temporal persists every step and resumes on crash.
- **Retries with policy.** Transient model / network failures are handled without ad-hoc code.
- **Signals.** An authoring role's decision on an open question can be delivered to an in-flight workflow as a signal, rather than polling.
- **Schedules + workflows in one system.** Daily cron and the workflow it kicks off share the same operator surface.
- **Observability.** Web UI shows in-flight workflows, stuck activities, and retry history — useful when narrative-consistency debugging meets infrastructure debugging.

Cost: Temporal is a service to run (self-hosted cluster or Temporal Cloud). Inngest is lighter (hosted, per-step billing) and covers most of the same cases with less operational weight.

### Recommended migration path

1. **Tier 0 now.** In-process cron library fires registered triggers; workers run in the same process; statements land in SQLite or local Postgres. End-to-end flow provable in a weekend.
2. **Tier 1 when multi-process.** Split workers into a pool behind a queue (BullMQ, Redis streams, or SQS). Promote cron to systemd timers. No code changes in workers — only the scheduler impl.
3. **Tier 3 when any of**: (a) any workflow exceeds ~minutes and must survive crashes, (b) concurrent workflow count routinely exceeds ~10, (c) authoring-role approval workflows become common, (d) operator visibility demands exceed log-tailing. Swap the scheduler impl for Temporal; workflow-shaped workers get promoted to Temporal workflows; event/cron workers remain plain.

Skipping tier 1 straight to Temporal is viable if any of the tier-3 triggers apply from day one.

## Open-question protocol (backbone of consistency)

The same mechanism addresses hallucination prevention, authoring-role coordination, and scheduled-vs-live symmetry.

**Core rule: the agent never silently commits an unsourced fact.**

When the agent produces a statement, each factual claim is either:
- **Grounded** — a retrieved canon / party / character statement id is recorded as source.
- **Invention** — no source exists. The invention is recorded with `kind=invention`, scope-tagged as party-local by default, and **an open-question record is emitted** routed to whichever role has canonization authority over that scope.

Open-question records have fields:
- `subject` — what the question is about (entity, event, rule).
- `candidate` — the invented detail as phrased in context.
- `routed_to` — role reference (e.g. `wizard-cabal`, `pantheon`).
- `blocks` — statement ids that depend on resolution.
- `urgency` — live (blocks continued play) or deferred (accumulates to a digest).

Delivery surfaces:
- **Live** — urgent questions post into the authoring room with appropriate notification (Discord @role / @everyone).
- **Scheduled** — a daily digest bundles deferred questions per authoring room, alongside the day's briefings.

When a decision arrives, the **open-question resolver** worker applies it: either the invention is promoted to canon (scope rewrite), replaced with the authored answer, or retracted; dependent statements are updated via supersedes records.

This protocol is what makes consistency *measurable* rather than aspirational (next section).

## Measurable consistency

Four metrics on a rolling window. Each is cheap to compute because the substrate (statement store + provenance) already carries the needed signal.

- **Grounding rate** = grounded-claim statements / total claim statements. Target: high, and per-scope — canon-heavy rooms should score higher than frontier-of-invention rooms.
- **Contradiction rate** = contradictions flagged by the consistency auditor / total audited claims. Target: near zero; spikes point to drift or bad retrieval.
- **Unresolved-question age** = median / p95 time between open-question creation and resolution. Target: bounded; rising tail means authoring roles are overloaded or routing is wrong.
- **Invention-to-canon ratio** = inventions promoted to canon / inventions created. Informational rather than a target — calibrates how much the agent is inventing vs. referring.

All four are derived from statement records; no separate telemetry pipeline is required.

Additionally, an **eval harness** runs offline:
- Held-out canon corpus + synthetic prompts.
- Measure retrieval precision/recall on entity mentions.
- Measure generation contradiction rate vs. ground truth.
- Measure appropriate-invention rate (does the agent ground when it should, invent when it should, and *emit an open question when it invents*?).

Eval runs are themselves statements (in an `eval` scope), tied to model version and prompt version, so regressions are visible over time.

## Agent postures & triggers (summary table)

| Posture | Triggers | Writes | Notifies |
|---|---|---|---|
| Channel narrator | event: new user message | `party:P` (narration, dialogue, mechanical), `invention` tags, open-questions | live: in-channel, @-role on urgent open-questions |
| Briefing generator | schedule (daily), signal | `meta:*` (briefing record), back-pointers | none direct; target room reads on next turn |
| Steering formalizer | event: free-form GM statement | authoring room (structured steering), emit-set into world/party | downstream rooms on next turn |
| Canonization proposer | schedule (hourly/daily) | authoring room (proposals) | digest to authoring role |
| Consistency auditor | event: new narration; schedule sweep | `consistency` scope (flags) | urgent: author role; routine: digest |
| Open-question resolver | event: authoring-role decision | canon / party / retractions | back-pointers to affected rooms |
| Interceptor | event: flow record in transit | interceptor's room + amended flow | per `rooms-and-roles.md` |

## Relationship to other docs

- `memory-model.md` — defines the statements and scopes this runtime produces and reads.
- `rooms-and-roles.md` — defines the authorization boundaries that workers enforce at retrieval time and the flow records interceptors act on.
- `framework-evaluation.md` — this doc narrows the candidate list to thin agent runtimes (Claude Agent SDK, LangGraph, Mastra) and the store/scheduler choices they leave to us.

## Open questions

- Language / stack: Python (LangGraph, richer ML ecosystem) or TypeScript (Mastra, tighter Discord integration)? Affects every other choice below.
- Start Postgres-first or SQLite-first? SQLite is trivially deployable; Postgres is the eventual target. `pgvector` decides this one if we go Postgres.
- Should the consistency auditor run on every narration turn (latency cost, better safety) or asynchronously (cheaper, some contradiction lag)?
- Where does the eval harness live — same repo, same store, separate scope? (Leaning: same store, `eval` scope, so eval results become first-class records.)
- What's the minimum viable interception backend in tier 0 — an in-process chain-of-responsibility, or do we need durable workflows from day one to express pre-emption reliably?
