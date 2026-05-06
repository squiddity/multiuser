# Workflow Session Store

## Purpose

Define the generic persistence pattern for interruptible agent workflows that need private, replayable working state without inventing a new top-level scope for each workflow.

Onboarding is the first concrete consumer, but the same substrate is intended for other session-shaped flows such as safety check-ins, character revisions, solo preludes, or guided intake threads.

## Core rule

**Workflow type is metadata, not a new scope kind.**

Durable workflow state is stored in the existing `session` scope. The workflow identity (`onboarding`, `safety-check`, `quest-intake`, and so on) is recorded on statements as structured fields rather than as a new freeform scope namespace.

This keeps scope semantics stable for authorization, retrieval, and isolation while still letting new workflows appear without storage-schema churn.

## Statement shape

Each workflow session append writes a `kind=governance` statement in `session` scope with fields that include:

- `workflowType` — stable workflow identifier such as `onboarding`
- `workflowOwnerId` — the principal the session belongs to
- `workflowEventType` — event label such as `session-created`, `field-set`, `confirmed`, `session-reset`
- `state` — the latest workflow-local state snapshot
- `workflowMetadata` — optional event-specific structured details

The statement content remains human-readable so the event stream is auditable without inspecting JSON alone.

## Session identity

A workflow session id is derived deterministically from:

- workflow type
- owner id

That yields one resumable active session stream per `(workflowType, ownerId)` pair unless a later workflow chooses a different keying policy.

## Replay model

Workflow sessions are reconstructed by replaying the append-only statement stream in session scope.

- The latest valid `state` snapshot for the matching `workflowType` is the active state.
- `session-reset` clears the active state for that session stream.
- A later `session-created` event begins a new active lifecycle on the same session id.

The workflow agent remains stateless. Recovery comes from replay, not hidden process memory.

## Boundary with workflow-specific behavior

The generic workflow session store owns:

- deterministic session identity
- session-scope statement append/read logic
- replay and reset semantics
- persistence across process restarts

Workflow-specific layers own:

- invite routing
- private thread or channel policy
- validation rules
- completion side effects such as identity linking or role grants
- workflow-specific state schema and event naming

## Why this shape

This pattern preserves the project’s scope model while avoiding a proliferation of special-purpose stores.

It supports two goals at once:

1. durable, auditable private workflow state
2. easy introduction of new agent workflows without adding new scope types or bespoke persistence infrastructure
