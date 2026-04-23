# LLM Runtime Architecture

## Purpose

Define how LLM invocation, tool loops, and session-turn mechanics are integrated without coupling domain logic to a single vendor/framework runtime.

## Decision summary

- Runtime base: `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`.
- Local boundary: workers and agents call a local `LlmRuntime` interface.
- Canonical state remains in the statement store; runtime transcript state is reconstructable.

## Why this architecture

The project needs:

- provider/model flexibility per role,
- consistent tool-call execution lifecycle,
- per-turn usage/cost visibility,
- low coupling between domain contracts and runtime implementation details.

pi's lower-level runtime packages provide those primitives with less application-level opinion than a full framework-managed memory/session stack.

## Non-goals

- Runtime-managed memory as authoritative canon.
- Binding room/scope semantics to any SDK session file format.

## Future option: `pi-coding-agent`

`pi-coding-agent` remains a deliberate future option, especially for:

- compaction hooks,
- extension/resource loading workflows,
- rich session tree operations for operator UX.

If introduced, it should remain a runtime/session convenience layer and not replace canonical statement-store authority.

## Operational guidance

- Keep model selection declarative per agent role.
- Keep tool policies and scope checks at the domain boundary.
- The current pi runtime adapter accepts local tool descriptors but does not execute a native tool loop yet; resolver behavior should remain robust when tool outputs are unavailable.
- Persist usage/cost telemetry in first-class records tied to statement/turn IDs.
