# Discord Onboarding Schema Draft (TypeBox, v1)

## Purpose

Provide a lift-and-implement schema draft for onboarding interactions, character draft fields, and routing decisions.

This is a contract draft for milestone 0003 implementation and should stay aligned with:

- `docs/discord-onboarding-and-character-creation.md`
- `docs/discord-onboarding-interaction-script.md`

## TypeBox draft

```ts
import { Type as T, Static } from '@sinclair/typebox';

// --- Enums ---

export const OnboardingActionKey = T.Union([
  T.Literal('onboard.start'),
  T.Literal('onboard.resume'),
  T.Literal('onboard.continue'),
  T.Literal('onboard.cancel'),
  T.Literal('onboard.name.open'),
  T.Literal('onboard.name.submit'),
  T.Literal('onboard.profile.select'),
  T.Literal('onboard.review.open'),
  T.Literal('onboard.confirm'),
  T.Literal('onboard.edit.name'),
  T.Literal('onboard.edit.profile'),
  T.Literal('onboard.private-thread.open'),
]);

export const OnboardingFieldKey = T.Union([T.Literal('name'), T.Literal('profile')]);

export const ProfileFieldValues = T.Record(T.String({ minLength: 1 }), T.String({ minLength: 1 }));

export const OnboardingStep = T.Union([
  T.Literal('invited'),
  T.Literal('joined'),
  T.Literal('linked'),
  T.Literal('character-drafting'),
  T.Literal('character-confirmed'),
  T.Literal('room-assigned'),
  T.Literal('completed'),
  T.Literal('failed'),
]);

export const RoutingDecisionSource = T.Union([
  T.Literal('rule'),
  T.Literal('model-assisted'),
  T.Literal('operator'),
]);

// --- Character draft fields ---
// Only `name` is hardcoded. All other fields (pronouns, hook, archetype, etc.)
// are agent-defined keys in the flexible `profile` Record.

export const CharacterName = T.String({ minLength: 2, maxLength: 40 });

export const CharacterDraft = T.Object({
  name: CharacterName,
  profile: ProfileFieldValues,
});

// --- Interaction records ---

export const OnboardingInteractionRecord = T.Object({
  interactionId: T.String({ minLength: 1 }),
  actionKey: OnboardingActionKey,
  userId: T.String({ minLength: 1 }),
  sessionId: T.String({ minLength: 1 }),
  step: OnboardingStep,
  expiresAt: T.String({ format: 'date-time' }),
  authorizationPolicy: T.String({ minLength: 1 }),
  createdAt: T.String({ format: 'date-time' }),
});

export const OnboardingSessionState = T.Object({
  sessionId: T.String({ minLength: 1 }),
  inviteId: T.String({ minLength: 1 }),
  userId: T.String({ minLength: 1 }),
  discordUserId: T.String({ minLength: 1 }),
  step: OnboardingStep,
  retryCounts: T.Record(OnboardingFieldKey, T.Integer({ minimum: 0 })),
  draft: T.Optional(CharacterDraft),
  updatedAt: T.String({ format: 'date-time' }),
});

export const ModelSuggestion = T.Object({
  destination: T.String({ minLength: 1 }),
  confidence: T.Number({ minimum: 0, maximum: 1 }),
  rationale: T.String({ minLength: 1 }),
});

export const RoutingDecisionRecord = T.Object({
  sessionId: T.String({ minLength: 1 }),
  userId: T.String({ minLength: 1 }),
  characterId: T.String({ minLength: 1 }),
  candidateDestinations: T.Array(T.String({ minLength: 1 }), { minItems: 1 }),
  selectedDestination: T.String({ minLength: 1 }),
  decisionSource: RoutingDecisionSource,
  appliedRuleIds: T.Array(T.String({ minLength: 1 })),
  modelSuggestion: T.Optional(ModelSuggestion),
  allowlistValidationPassed: T.Boolean(),
  permissionValidationPassed: T.Boolean(),
  createdAt: T.String({ format: 'date-time' }),
});

// --- Constants ---

export const ONBOARDING_VALIDATION_RETRY_LIMIT = 2;

// --- Static types ---
export type OnboardingActionKeyT = Static<typeof OnboardingActionKey>;
export type OnboardingFieldKeyT = Static<typeof OnboardingFieldKey>;
export type ProfileFieldValuesT = Static<typeof ProfileFieldValues>;
export type OnboardingStepT = Static<typeof OnboardingStep>;
export type CharacterDraftT = Static<typeof CharacterDraft>;
export type OnboardingInteractionRecordT = Static<typeof OnboardingInteractionRecord>;
export type OnboardingSessionStateT = Static<typeof OnboardingSessionState>;
export type RoutingDecisionRecordT = Static<typeof RoutingDecisionRecord>;
```

## Runtime normalization notes

Before validating strings with the schemas above:

- trim leading/trailing whitespace,
- collapse repeated internal whitespace where useful for UX,
- treat empty optional pronouns as omitted.

## Guardrails to enforce in code (in addition to schema)

1. Interaction ownership: `interaction.userId` must match `session.userId`.
2. Session step gate: action keys are only valid for expected step transitions.
3. Routing allowlist: `selectedDestination` must be in campaign allowlist.
4. Routing projection: permission checks must pass before emitting success UX.
5. Idempotency: duplicate interaction callbacks should not double-advance state.
