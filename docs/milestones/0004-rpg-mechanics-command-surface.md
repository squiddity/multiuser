# Milestone 0004 — RPG Mechanics and Command Surface

## Purpose

Deliver the deferred gameplay command path and mechanics integration that were intentionally excluded from milestone 0001.

## Deferred items moved here

- Mechanical resolver dispatch from live responder when mechanical intent is detected (`command-query` path).
- CLI/user command coverage for gameplay mechanics (starting with `/roll`).
- Broader command-surface parity between harness and production adapter for mechanics-related actions.
- Safety command surface previously deferred (`/pause`, `/unpause`, `/fade`) with explicit runtime gating semantics.

## Scope

### A. Mechanical dispatch

- Detect and route mechanical statements to resolver path.
- Emit structured `mechanical` results with seeds and provenance.
- Keep narrative continuation coherent with mechanical outcomes.

### B. Command surface

- Implement and test `/roll` path end-to-end.
- Define error handling and user feedback for malformed mechanic commands.
- Ensure parity across harness and Discord command mappings.

### C. Deferred safety command controls

- Implement `/pause` and `/unpause` runtime controls at room scope.
- Implement `/fade` content redirection behavior.
- Add tests confirming enforcement and resume semantics.

## Exit criteria

- Mechanical resolver dispatch is active and tested.
- `/roll` command path is stable in demo and integration tests.
- Safety command controls are implemented with deterministic enforcement tests.
- Command outcomes are reflected in statements with complete audit fields.
