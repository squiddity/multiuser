# Platform Adapters (Discord v1)

## Purpose

Define how the system connects to external chat platforms without baking any one platform's vocabulary into the core. Discord is the v1 target; Matrix, Slack, and others must be addable later by implementing the same adapter interface and registering a new backend. The core model (rooms, roles, scope bindings, flows) is the authoritative surface; the platform is a view.

## Principles

1. **Platform-agnostic core, platform-specific backend.** The `platform` capability is abstract; each backend (DiscordAdapter, MatrixAdapter, …) implements it. Core code never imports a Discord client.
2. **Declarative desired-state, not imperative tool calls.** Admin operations land as statements in a `governance` scope describing intent ("room R exists", "user U holds role `player` in room R", "room R is archived"). A **reconciler worker** diffs the desired state against each platform and applies changes.
3. **The platform is a view; our state is the source of truth.** External drift (someone edits Discord through the UI) is detected, logged, and resolved by policy — never silently absorbed as ground truth.
4. **Capabilities gate everything.** Platform actions are workflow capabilities on roles, as defined in `rooms-and-roles.md`. An agent may only invoke a platform action when the invoking role (in the originating room) holds the matching capability.
5. **Admins never touch the UI for group management if they don't want to.** The agent is the operator console; the reconciler makes it real.

## Capability taxonomy

Extends `rooms-and-roles.md`. Platform capabilities split into admin and notification bands.

### Admin (privileged)

- `platform:create-room` — author a new room and map it to a new platform container (channel).
- `platform:configure-membership` — add/remove users from a room and keep platform membership in sync.
- `platform:organize` — group rooms into platform-native containers (categories, spaces).
- `platform:lifecycle` — archive, merge, split, rename rooms (see lifecycle section below).
- `platform:link-identity` — bind a system user to a platform identity, or revoke a binding.

Admin capabilities are typically held by GM-level or higher roles, or by a dedicated `operator` role. An in-fiction wizard cabal creating a spinoff table, or a pantheon splitting a party, is the same capability invocation at different stack layers.

### Notification (per-room, ordinary)

- `platform:notify` — send a message (the bread-and-butter of narration).
- `platform:mention-user` / `platform:mention-role` / `platform:mention-all` — targeted attention.
- `platform:thread` — spawn a sub-thread within a room.
- `platform:react` / `platform:edit` / `platform:retract` — reactions, edits, and tombstoning surfaced to the platform.

These are almost always enabled within a room's scope binding but remain explicit so we can silence rooms (e.g. a `silenced` narrative attribute disables `platform:notify` for the duration).

## Mapping layer

A persistent mapping table, itself stored as statements in a `mapping` scope:

- **Room ↔ platform container.** Room id → (platform, channel/thread id). One room may have multiple platform mappings if projected to more than one platform.
- **Role ↔ platform role + permission set.** System role id → (platform, platform role id, permission overwrites). Permissions are derived from the room's scope binding and the role's read/write/notify capabilities, then expressed in platform terms.
- **User ↔ platform identity.** System user id → (platform, platform user id), with a link token flow for enrollment.

Mapping records are append-only with supersedes chains, so "the channel id changed after Discord migration" is a normal history event, not a data-loss condition.

## Reconciler worker

A dedicated worker (per `runtime-and-processing.md`) watches `governance` and `mapping` scopes for new statements and converges platform state:

- **Desired-state diff.** Compute the set difference between intended state (latest statements) and observed platform state (via platform APIs).
- **Apply.** Execute platform calls for each diff item. Each call emits a reconciliation statement recording the intent, the action, and the platform's response.
- **Idempotence.** Applying the same desired-state twice is a no-op. If the reconciler crashes mid-batch, re-running converges.
- **Rate limits.** Platform backends declare their limits; the reconciler honors them with retry/backoff.
- **Durability fit.** Long batches (creating a dozen rooms for a new campaign) are the case where Temporal-tier scheduling pays off — partial progress survives crashes.

## Drift handling

External changes to the platform (UI edits, bot kicks, manual channel creation) are inevitable.

- **Detection.** Reconciler or a periodic auditor compares platform state to desired state.
- **Classification.** Each divergence is one of: `unmanaged-create` (a channel we didn't author), `unmanaged-mutation` (permissions/name changed under us), `unmanaged-delete` (a mapped channel vanished), `membership-drift` (members differ from intent).
- **Policy per class.** Defaults:
  - `unmanaged-create` → log an `unmanaged` statement in governance, notify the operator role; do not auto-adopt. Adoption is a separate explicit governance action.
  - `unmanaged-mutation` → re-apply desired state, log the diff. Name/topic changes may be tolerated if an `autotolerance` policy is set.
  - `unmanaged-delete` → mark mapping broken, route inquiry to the operator role; do not auto-recreate (data loss risk).
  - `membership-drift` → re-apply membership from intent.

Every drift event and its resolution is a statement. Nothing happens invisibly.

## Room lifecycle

Closes the lifecycle open question from `rooms-and-roles.md`.

- **Create.** `governance:room-create` + `mapping:room-to-channel` → reconciler creates the channel, applies permission overwrites, adds members per their roles.
- **Archive.** `governance:room-archive` → reconciler sets the channel to read-only on platform, removes `platform:notify` capability from roles in that room. Statements remain addressable; no data is deleted.
- **Split.** `governance:room-split(source, child-a, child-b, membership-partition, scope-partition)` → reconciler creates the two child rooms; scope statements from the source are referenced (not copied) by back-pointer so provenance is preserved; source is archived.
- **Merge.** `governance:room-merge(sources, target)` → inverse of split; target room's scope union-reads from the sources' scopes; sources are archived.
- **Rename / reorganize.** Trivial re-statements of mapping; reconciler applies.

Split and merge are the delicate ones — they touch scope boundaries. Handled at the governance layer, not the platform layer: the platform side is just applying the outcome.

## Bot identity and platform permissions

The system acts in each platform via a bot identity.

- **Principle of least privilege at the platform.** The bot holds the narrowest platform permissions sufficient for the admin capabilities we grant it — typically manage channels, manage roles, send messages, manage threads. Server-wide admin is avoided unless explicitly required.
- **Authorization is layered.** Even if the bot *can* perform an action at the platform, our role system may refuse to invoke it. Platform permission is the outer bound; our capabilities are the inner gate.
- **Per-guild (Discord) / per-workspace isolation.** One deployment may serve multiple guilds; bot credentials and mappings are per-guild. Cross-guild data flow is never implicit.

## Discord v1 specifics

- **Container mapping.** Room → text channel. Session → optional thread within the channel. Room groups → category.
- **Role mapping.** System role → Discord role + a channel permission overwrite. The Discord role is the identity; the overwrite is the per-channel gate. Because we want crisp per-room visibility, permission overwrites are the main lever, not global role permissions.
- **Membership model.** Add users to a room by applying the mapped Discord role and any per-channel overwrite. Private rooms use deny-@everyone + allow-specific-role.
- **@everyone / @here semantics.** `platform:mention-all` maps to @everyone (or @here during active sessions). Used sparingly; gated behind capability, not just notification preference.
- **Threads.** Used for sub-scopes within a room (e.g. a specific scene within a party) when we want platform-level separation without creating a new room. Thread messages still write to the parent room's scope unless explicitly scoped otherwise.
- **Reactions.** Consumable as a lightweight feedback signal (e.g. GM upvotes a canonization proposal), recorded as statements in the originating room.
- **Rate limits.** Discord's per-route limits are well-documented; the reconciler respects them. Bulk operations (large role re-assignment) must be batched.
- **Identity linking.** Enrollment flow: user runs `/link` command in a bootstrapping channel; bot issues a link token; token is redeemed via a web endpoint tying Discord user id to system user id. Without linking, a Discord user has no capabilities in our system.

## Governance logging

All admin operations are statements in the `governance` scope (per `memory-model.md`). This scope is:

- **Append-only and queryable.** Any admin action is reconstructable.
- **Scoped per-room.** A room's governance history is readable to roles with appropriate read capability in that room (typically operator / GM-tier).
- **Never platform-only.** An action that exists on Discord but not in our governance log is by definition `unmanaged` — drift, not authority.

## Relationship to other docs

- `memory-model.md` — governance and mapping are scope types alongside world/party/character/session.
- `rooms-and-roles.md` — platform capabilities are added to the capability taxonomy; room lifecycle rules close one of its open questions.
- `runtime-and-processing.md` — the reconciler is a worker; long reconciliation batches are a tier-3 (Temporal/Inngest) workflow candidate.
- `framework-evaluation.md` — sharpens the operational-fit criterion: the framework must not obstruct running long reconciliation workflows alongside live-response workers.

## Open questions

- Do we support projecting a single room to multiple platforms simultaneously (Discord + Matrix mirror), or is it always one platform per room?
- When a split partitions scope, do we deep-copy statements into each child scope, or rely on read-through back-pointers? (Leaning: back-pointers — preserves provenance, avoids write amplification.)
- How is bot credential rotation handled without breaking in-flight workflows?
- What's the fallback if a platform API is down for hours — queue and retry (tier 3 buys this), or pause affected workers?
- For in-fiction admin (wizard cabal creates a spinoff table), should the narrative rendering of that creation be automatic (a briefing says "a new party has been convened") or explicitly authored by the invoking role?
