import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { ping } from '../store/client.js';
import { env } from '../config/env.js';
import { getStatement, listByScope, scopeParts, deleteStatement } from '../store/statements.js';
import { appendIndexAndEmit } from '../store/emit.js';
import { NewStatement } from '../core/statement.js';
import { canonizeOpenQuestion, CanonizeError } from '../store/canonize.js';
import type { EventBus } from '../core/events.js';

const CanonizeRequest = z.object({
  userId: z.string().min(1),
  openQuestionId: z.string().uuid(),
  decision: z.enum(['promote', 'reject', 'supersede']),
  rationale: z.string().optional(),
  revisedCandidate: z.string().optional(),
});

export function createApp(events: EventBus): Hono {
  const app = new Hono();

  app.use('*', cors());
  app.use('*', honoLogger());

  app.get('/health', async (c) => {
    try {
      await ping();
      return c.json({ ok: true, db: 'connected', version: '0.0.1' });
    } catch (err) {
      return c.json({ ok: false, db: 'disconnected', error: String(err) }, 503);
    }
  });

  app.post('/api/statements', async (c) => {
    const body = await c.req.json();
    const parsed = NewStatement.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', details: parsed.error.flatten() }, 400);
    }
    const input = parsed.data;
    const id = await appendIndexAndEmit(input, events);
    const created = await getStatement(id);
    if (!created) {
      return c.json({ error: 'failed to retrieve after creation' }, 500);
    }
    return c.json(toStatementResponse(created), 201);
  });

  app.get('/api/statements/:id', async (c) => {
    const id = c.req.param('id');
    const statement = await getStatement(id);
    if (!statement) {
      return c.json({ error: 'not found' }, 404);
    }
    return c.json(toStatementResponse(statement));
  });

  app.delete('/api/statements/:id', async (c) => {
    const id = c.req.param('id');
    const deleted = await deleteStatement(id);
    if (!deleted) {
      return c.json({ error: 'not found' }, 404);
    }
    return c.text('', 204 as any);
  });

  app.get('/api/statements', async (c) => {
    const scopeType = c.req.query('scope_type');
    const scopeKey = c.req.query('scope_key');
    const kind = c.req.query('kind');
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    if (!scopeType) {
      return c.json({ error: 'scope_type query param required' }, 400);
    }

    const scope = scopeKey
      ? {
          type: scopeType as any,
          [scopeType === 'party'
            ? 'partyId'
            : scopeType === 'character'
              ? 'characterId'
              : scopeType === 'session'
                ? 'sessionId'
                : scopeType === 'meta' || scopeType === 'governance'
                  ? 'roomId'
                  : scopeType === 'rules'
                    ? 'system'
                    : 'worldId']: scopeKey,
        }
      : { type: scopeType as any };

    const results = await listByScope(scope as any, {
      kind: kind || undefined,
      limit: Math.min(limit, 1000),
    });
    return c.json({
      statements: results.map(toStatementResponse),
      total: results.length,
      limit,
      offset,
    });
  });

  app.post('/api/rooms/:roomId/canonize', async (c) => {
    const roomId = c.req.param('roomId');
    const body = await c.req.json();
    const parsed = CanonizeRequest.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'invalid request', details: parsed.error.flatten() }, 400);
    }
    try {
      const id = await canonizeOpenQuestion({ ...parsed.data, roomId }, events);
      const statement = await getStatement(id);
      if (!statement) return c.json({ error: 'failed to retrieve after creation' }, 500);
      return c.json(toStatementResponse(statement), 201);
    } catch (err) {
      if (err instanceof CanonizeError) {
        if (err.code === 'forbidden') return c.json({ error: err.message }, 403);
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }
  });

  function toStatementResponse(row: any): any {
    const { scopeType, scopeKey } = row;
    let scope: any;
    switch (scopeType) {
      case 'world':
        scope = { type: 'world' };
        break;
      case 'party':
        scope = { type: 'party', partyId: scopeKey };
        break;
      case 'character':
        scope = { type: 'character', characterId: scopeKey };
        break;
      case 'session':
        scope = { type: 'session', sessionId: scopeKey };
        break;
      case 'meta':
        scope = { type: 'meta', roomId: scopeKey };
        break;
      case 'governance':
        scope = { type: 'governance', roomId: scopeKey };
        break;
      case 'rules':
        const [system, variant] = (scopeKey ?? '').split(':');
        scope = { type: 'rules', system, variant: (variant as any) || 'base' };
        break;
      case 'style':
        scope = { type: 'style', worldId: scopeKey ?? undefined };
        break;
      case 'mapping':
        scope = { type: 'mapping' };
        break;
      case 'eval':
        scope = { type: 'eval' };
        break;
      default:
        scope = { type: 'unknown' };
    }
    return {
      id: row.id,
      scope,
      kind: row.kind,
      authorType: row.authorType,
      authorId: row.authorId,
      icOoc: row.icOoc,
      createdAt: row.createdAt.toISOString(),
      supersedes: row.supersedes,
      sources: row.sources,
      content: row.content,
      fields: row.fields,
    };
  }

  return app;
}

export function getPort(): number {
  return parseInt(process.env.API_PORT ?? '3000', 10);
}
