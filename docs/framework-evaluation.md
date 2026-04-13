# Agent Framework Evaluation

## Goal

Select (or build) an agent framework that supports a **multi-user, multi-session** application whose primary surface is **multimedia group discussion platforms**, starting with **Discord**. The framework must make *session* and *memory* first-class, partitionable primitives rather than assumptions baked into a single-user host.

## Context & constraints

- Concurrency shape: many users interacting in parallel across many channels/threads/DMs; context often overlaps (shared channel history) but identity must remain distinct.
- Media shape: text today, but discussion platforms routinely include images, audio, video, and file attachments — the abstraction must not assume text-only turns.
- Deployment shape: long-running service, not a per-invocation CLI.
- Extensibility: we expect to add tools, retrievers, and platform adapters (Discord first, others later) without forking the framework.

## Evaluation criteria

Each candidate is scored on the following dimensions. Prefer primitives over conventions — a framework that *enables* a pattern via configuration is stronger than one that merely doesn't forbid it.

### 1. Session scoping
- Can a "session" be keyed by arbitrary composite identity (user × channel × thread)?
- Are sessions isolated by default, with explicit opt-in to sharing?
- Is session lifetime independent of process lifetime (persisted, resumable)?

### 2. Memory partitioning
- Are there distinct memory scopes (per-user, per-channel, per-thread, global)?
- Can memories be shared or promoted between scopes explicitly?
- Is the memory store pluggable (swap vector DB, KV, SQL)?
- How is memory write/read authorization modeled across users?

### 3. Multi-tenant safety
- Is there a clear boundary preventing one user's context from leaking into another's prompt?
- Are tool invocations scoped to the invoking identity?
- How are rate limits, quotas, and abuse controls expressed?

### 4. Discussion-platform fit
- First-class support for asynchronous, interleaved turns (not strict request/response).
- Ability to ingest multimedia attachments as part of a turn.
- Ability to address specific users, quote prior messages, and react to events (edits, deletions, reactions).
- Streaming output compatible with platform message semantics (edits, chunking, typing indicators).

### 5. Extensibility
- Plugin / tool model: clarity, type-safety, composability.
- Platform-adapter model: can a new chat platform be added without touching the core?
- Observability hooks: tracing, eval, replay.

### 6. Operational fit
- Runtime / language (TS, Python, Go) — alignment with team skills.
- Deployment story: stateless workers + external state, or stateful process?
- License, governance, release cadence, community health.

## Candidates under consideration

The following are starting points, not a shortlist. Each should be assessed against the criteria above and documented in its own section when we dig in.

- **opencode plugin** — host is a single-user coding agent; reuses its session/memory model. Likely poor fit for the multi-tenant shape, but worth a concrete disqualification rather than a hand-wave.
- **Letta** — memory blocks are first-class and scoped; strong on memory partitioning, opinionated model.
- **LangGraph** — bring-your-own state schema and checkpointer; multi-tenant scoping falls out naturally, more construction required.
- **Mastra** (TS) — pluggable memory, threads as a primitive.
- **Claude Agent SDK** — minimal host; session store is the integrator's responsibility.
- **Others to consider**: Pydantic AI, Agno, CrewAI, Vercel AI SDK + custom memory, roll-our-own.

## Decision approach

1. Capture per-candidate notes under `docs/candidates/<name>.md` using the criteria above as headings.
2. Prototype the *riskiest* dimension (multi-tenant memory scoping with overlapping channel context) against the top two candidates before selecting.
3. Record the final choice and rationale as a decision doc under `docs/decisions/`.

## Open questions

- Is there a hard requirement that the same agent instance be reachable from multiple platforms simultaneously, or is Discord-first acceptable?
- Do we need per-user model selection / key management, or is there a single service-level model?
- What are the retention and deletion obligations for stored memory (user-initiated forgetting, platform TOS)?
