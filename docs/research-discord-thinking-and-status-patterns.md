# Discord Thinking/Status Pattern Research (Kimaki reference)

## Purpose

Capture practical Discord UX patterns observed in a production bot implementation and translate them into guidance for milestone 0003 UI decisions.

Reference implementation reviewed: `https://github.com/remorses/kimaki`.

## Observed patterns

### 1. Reasoning visibility is represented as a lightweight placeholder, not raw chain-of-thought

- Kimaki maps reasoning parts to a generic marker (`thinking`) instead of exposing full reasoning text in normal display flow.
- In `cli/src/message-formatting.ts`, reasoning part formatting returns a short placeholder label rather than rendering internals.

Design implication:

- For our Discord UX, prefer **status semantics** (“thinking”, “resolving”, “checking canon”) over exposing model internals.
- Keep user-facing output narrative-first and auditable via statements, not by dumping hidden model traces.

### 2. Typing indicator is treated as the primary "work in progress" signal

- Kimaki keeps typing alive with periodic pulses during active work and stops cleanly when done.
- In `cli/src/session-handler/thread-session-runtime.ts`, typing is gated by real busy state and refreshed on ~7s cadence.

Design implication:

- For our onboarding and play loops, use typing/deferred response as the baseline progress signal.
- Avoid noisy status spam when Discord-native affordances already convey liveness.

### 3. Interactive UI is shown only after buffered output is flushed

- Kimaki stops typing and flushes pending outputs before rendering interactive controls.
- This reduces ordering confusion where buttons might appear before users see the context message.

Design implication:

- In our button/modal flows (onboarding, decisions), enforce a strict sequence:
  1. context message visible,
  2. then controls become active.

### 4. Pending tool noise is suppressed by default verbosity

- Kimaki suppresses low-value in-progress tool noise at default verbosity and only surfaces essential signals.

Design implication:

- Our Discord v1 should also default to a low-noise UI in shared channels.
- Detailed internal traces belong in logs/debug views, not player-facing channels.

### 5. Ephemeral-first + scoped interaction handling is robust

- Kimaki uses ephemeral interaction responses and custom-id driven handlers for many controls.

Design implication:

- This aligns with our chosen onboarding strategy (ephemeral-first, escalate to private thread only when needed).
- Continue treating custom IDs as opaque handles backed by server-side interaction records.

## What this means for milestone 0003

1. Keep **public channels narrative-clean**: no raw model reasoning output.
2. Use **typing + deferred responses** for progress feedback by default.
3. Use **ephemeral messages** for user-specific setup/actions.
4. Escalate to **private thread** for multi-turn private drafting.
5. Ensure **message-before-controls ordering** in interaction flows.

## Recommendation for our current onboarding script

The existing onboarding interaction script remains valid with no structural changes. Add one explicit behavior rule in implementation:

- If a "thinking" status is shown, it should be short-lived, non-sensitive, and preferably ephemeral (or replaced by typing indicator when possible).
