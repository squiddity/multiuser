import { Type, type Static } from 'typebox';
import { DateTime, NonEmptyString } from '../lib/schema-primitives.js';
import { withValidation } from '../lib/typebox.js';

const OnboardingActionKeySchema = Type.Union([
  Type.Literal('onboard.start'),
  Type.Literal('onboard.resume'),
  Type.Literal('onboard.continue'),
  Type.Literal('onboard.cancel'),
  Type.Literal('onboard.name.open'),
  Type.Literal('onboard.name.submit'),
  Type.Literal('onboard.profile.select'),
  Type.Literal('onboard.review.open'),
  Type.Literal('onboard.confirm'),
  Type.Literal('onboard.edit.name'),
  Type.Literal('onboard.edit.profile'),
  Type.Literal('onboard.private-thread.open'),
]);
export const OnboardingActionKey = withValidation(OnboardingActionKeySchema);
export type OnboardingActionKey = Static<typeof OnboardingActionKeySchema>;

const OnboardingFieldKeySchema = Type.Union([Type.Literal('name'), Type.Literal('profile')]);
export const OnboardingFieldKey = withValidation(OnboardingFieldKeySchema);
export type OnboardingFieldKey = Static<typeof OnboardingFieldKeySchema>;

const OnboardingStepSchema = Type.Union([
  Type.Literal('invited'),
  Type.Literal('joined'),
  Type.Literal('linked'),
  Type.Literal('character-drafting'),
  Type.Literal('character-confirmed'),
  Type.Literal('room-assigned'),
  Type.Literal('completed'),
  Type.Literal('failed'),
]);
export const OnboardingStep = withValidation(OnboardingStepSchema);
export type OnboardingStep = Static<typeof OnboardingStepSchema>;

const RoutingDecisionSourceSchema = Type.Union([
  Type.Literal('rule'),
  Type.Literal('model-assisted'),
  Type.Literal('operator'),
]);
export const RoutingDecisionSource = withValidation(RoutingDecisionSourceSchema);
export type RoutingDecisionSource = Static<typeof RoutingDecisionSourceSchema>;

const CharacterDraftSchema = Type.Object({
  name: Type.String({ minLength: 2, maxLength: 40 }),
  profile: Type.Record(NonEmptyString, NonEmptyString, { minProperties: 1 }),
});
export const CharacterDraft = withValidation(CharacterDraftSchema);
export type CharacterDraft = Static<typeof CharacterDraftSchema>;

const OnboardingInteractionRecordSchema = Type.Object({
  interactionId: NonEmptyString,
  actionKey: OnboardingActionKeySchema,
  userId: NonEmptyString,
  sessionId: NonEmptyString,
  step: OnboardingStepSchema,
  expiresAt: DateTime,
  authorizationPolicy: NonEmptyString,
  createdAt: DateTime,
});
export const OnboardingInteractionRecord = withValidation(OnboardingInteractionRecordSchema);
export type OnboardingInteractionRecord = Static<typeof OnboardingInteractionRecordSchema>;

const RetryCountsSchema = Type.Object({
  name: Type.Integer({ minimum: 0 }),
  profile: Type.Integer({ minimum: 0 }),
});

const OnboardingSessionStateSchema = Type.Object({
  sessionId: NonEmptyString,
  inviteId: NonEmptyString,
  userId: NonEmptyString,
  discordUserId: NonEmptyString,
  step: OnboardingStepSchema,
  retryCounts: RetryCountsSchema,
  draft: Type.Optional(CharacterDraftSchema),
  updatedAt: DateTime,
});
export const OnboardingSessionState = withValidation(OnboardingSessionStateSchema);
export type OnboardingSessionState = Static<typeof OnboardingSessionStateSchema>;

const ModelSuggestionSchema = Type.Object({
  destination: NonEmptyString,
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
  rationale: NonEmptyString,
});
export const ModelSuggestion = withValidation(ModelSuggestionSchema);
export type ModelSuggestion = Static<typeof ModelSuggestionSchema>;

const RoutingDecisionRecordSchema = Type.Object({
  sessionId: NonEmptyString,
  userId: NonEmptyString,
  characterId: NonEmptyString,
  candidateDestinations: Type.Array(NonEmptyString, { minItems: 1 }),
  selectedDestination: NonEmptyString,
  decisionSource: RoutingDecisionSourceSchema,
  appliedRuleIds: Type.Array(NonEmptyString),
  modelSuggestion: Type.Optional(ModelSuggestionSchema),
  allowlistValidationPassed: Type.Boolean(),
  permissionValidationPassed: Type.Boolean(),
  createdAt: DateTime,
});
export const RoutingDecisionRecord = withValidation(RoutingDecisionRecordSchema);
export type RoutingDecisionRecord = Static<typeof RoutingDecisionRecordSchema>;

export const ONBOARDING_VALIDATION_RETRY_LIMIT = 2;

const StepOrder: OnboardingStep[] = [
  'invited',
  'joined',
  'linked',
  'character-drafting',
  'character-confirmed',
  'room-assigned',
  'completed',
  'failed',
];

export function isValidOnboardingTransition({
  from,
  to,
}: {
  from: OnboardingStep;
  to: OnboardingStep;
}): boolean {
  if (from === to) {
    return true;
  }

  if (from === 'failed') {
    return to === 'joined' || to === 'linked' || to === 'character-drafting';
  }

  if (to === 'failed') {
    return true;
  }

  const fromIndex = StepOrder.indexOf(from);
  const toIndex = StepOrder.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) {
    return false;
  }

  return toIndex === fromIndex + 1;
}

export function normalizeOnboardingInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
