import { Type, type Static } from 'typebox';
import { withValidation } from '../../lib/typebox.js';
import type { LlmToolDefinition } from '../../core/llm-runtime.js';
import { retrieveByScopes } from '../../store/retrieval.js';
import type { Scope } from '../../core/statement.js';

const ScopeSelectorSchema = Type.Union([
  Type.Object({ type: Type.Literal('world') }),
  Type.Object({ type: Type.Literal('party'), partyId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('character'), characterId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('session'), sessionId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('meta'), roomId: Type.String({ format: 'uuid' }) }),
  Type.Object({
    type: Type.Literal('rules'),
    system: Type.String(),
    variant: Type.Optional(
      Type.Union([Type.Literal('base'), Type.Literal('house')], { default: 'base' }),
    ),
  }),
  Type.Object({ type: Type.Literal('style'), worldId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('governance'), roomId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('mapping') }),
  Type.Object({ type: Type.Literal('eval') }),
]);

const RetrieveParamsSchema = Type.Object({
  scopes: Type.Array(ScopeSelectorSchema, {
    minItems: 1,
    description: 'Scopes to retrieve from',
  }),
  query: Type.Optional(Type.String({ description: 'Text search query' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, default: 10, description: 'Maximum results' })),
});

export const RetrieveParams = withValidation(RetrieveParamsSchema);
export type RetrieveParams = Static<typeof RetrieveParamsSchema>;

export function createRetrieveTool(): LlmToolDefinition {
  return {
    description:
      'Retrieve statements from the rules scope for rulebook context, rulings, and precedents.',
    parameters: RetrieveParams,
    execute: async (params) => {
      const results = await retrieveByScopes(params.scopes as Scope[], {
        query: params.query,
        limit: params.limit,
      });
      return results.map((row) => ({
        id: row.id,
        kind: row.kind,
        content: row.content.substring(0, 500),
        createdAt: row.createdAt,
      }));
    },
  };
}
