import { z } from 'zod';
import type { LlmToolDefinition } from '../../core/llm-runtime.js';
import { retrieveByScopes } from '../../store/retrieval.js';
import type { Scope } from '../../core/statement.js';

export const RetrieveParams = z.object({
  scopes: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('world') }),
        z.object({ type: z.literal('party'), partyId: z.string().uuid() }),
        z.object({ type: z.literal('character'), characterId: z.string().uuid() }),
        z.object({ type: z.literal('session'), sessionId: z.string().uuid() }),
        z.object({ type: z.literal('meta'), roomId: z.string().uuid() }),
        z.object({
          type: z.literal('rules'),
          system: z.string(),
          variant: z.enum(['base', 'house']).default('base'),
        }),
        z.object({ type: z.literal('style'), worldId: z.string().uuid() }),
        z.object({ type: z.literal('governance'), roomId: z.string().uuid() }),
        z.object({ type: z.literal('mapping') }),
        z.object({ type: z.literal('eval') }),
      ]),
    )
    .min(1)
    .describe('Scopes to retrieve from'),
  query: z.string().optional().describe('Text search query'),
  limit: z.number().int().positive().default(10).describe('Maximum results'),
});
export type RetrieveParams = z.infer<typeof RetrieveParams>;

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
