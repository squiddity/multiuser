# Statement Store Abstraction

## Purpose

Define the contract boundary for canonical/session truth so storage backends can evolve without changing domain workflows.

## Invariant

Canonical truth is the append-only statement model with scope isolation, provenance links, and supersedes chains.

This invariant is independent of physical backend.

## Interface boundary

Application logic consumes a `StatementStore` contract that covers:

- scoped retrieval,
- direct statement lookup,
- agent statement emission,
- open-question creation.

The default implementation uses Postgres (`PostgresStatementStore`).

## Design constraints

Any backend adapter must preserve:

1. Scope-correct reads and writes.
2. Deterministic statement IDs and provenance links.
3. Supersedes semantics for corrections/retractions.
4. Auditable source references for generated outputs.

## Backend evolution

Potential future adapters include:

- alternate SQL deployments,
- graph/vector hybrids,
- specialized memory engines (including cognee-style systems) as long as they satisfy the statement contract.

Adoption criteria are contract parity and migration safety, not backend novelty.

## Migration posture

- Keep contract tests backend-agnostic.
- Run parity tests against both default and candidate adapters before cutover.
- Avoid embedding backend-specific query assumptions in worker logic.
