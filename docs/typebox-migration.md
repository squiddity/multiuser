# TypeBox Migration Plan

## Purpose

Plan a full migration from Zod to TypeBox while preserving current runtime behavior and schema contracts.

## Why migrate

- TypeBox schemas are plain-JSON serializable.
- Better fit for SDK/tooling integration where schemas cross process/runtime boundaries.
- Alignment with pi ecosystem conventions.

## Migration principles

1. No contract regressions during migration.
2. Domain behavior remains unchanged.
3. Migration is incremental and test-gated.

## Status

Migration completed for v1 codepaths:

- Runtime validation and schema contracts use TypeBox 1.x.
- Worker payloads, resolver contracts, tool parameter schemas, statement/scope/room contracts, API body validation, and env validation are all TypeBox-backed.
- Direct Zod dependency has been removed from project runtime code.

## Phases

### Phase 1: Boundary-first adapters

- Introduce shared schema adapter helpers where needed.
- Keep existing Zod validation in place.
- Add parity tests for representative schema families.

### Phase 2: Core contracts

- Migrate core request/response schemas (worker payloads, resolver I/O, tool args).
- Migrate env/config schema validation.
- Preserve current error semantics for callers.

### Phase 3: Store and API surfaces

- Migrate statement and scope schemas.
- Migrate API request/response schemas.
- Add snapshot/parity checks for serialized schema artifacts.

### Phase 4: Remove Zod runtime dependency

- Remove remaining Zod imports. ✅
- Keep compatibility shims only if external consumers still depend on Zod-shaped exports. (Not required for current v1 boundaries.)

## Acceptance criteria

- Type parity for all externally consumed contracts.
- Existing unit/integration/API tests remain green.
- No scope-leakage or authorization regressions.
