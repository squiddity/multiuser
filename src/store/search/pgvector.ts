import { sql } from 'drizzle-orm';
import { db } from '../client.js';
import { statements } from '../schema.js';
import type { ScopePattern } from '../../core/room.js';
import type { SearchResult, SearchBackend, SearchOptions } from '../../core/search.js';
import type { Embedder } from '../../core/embedder.js';
import { patternToSql } from '../retrieval.js';

export class PgvectorSearchBackend implements SearchBackend {
  private embedder: Embedder;

  constructor(embedder: Embedder) {
    this.embedder = embedder;
  }

  async search(patterns: ScopePattern[], opts: SearchOptions): Promise<SearchResult[]> {
    if (patterns.length === 0) return [];

    const [embedding] = await this.embedder.embed([opts.text]);
    const vecLit = `[${embedding!.join(',')}]`;
    const scopeClauses = patterns.map((p) => patternToSql(p));
    const scopeWhere = sql.join(scopeClauses, sql` OR `);

    let query;
    if (opts.kind) {
      query = sql`
        SELECT id, (embedding <=> ${vecLit}::vector) AS distance
        FROM statements
        WHERE (${scopeWhere})
          AND embedding IS NOT NULL
          AND kind = ${opts.kind}
        ORDER BY embedding <=> ${vecLit}::vector
        LIMIT ${opts.limit}
      `;
    } else {
      query = sql`
        SELECT id, (embedding <=> ${vecLit}::vector) AS distance
        FROM statements
        WHERE (${scopeWhere})
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecLit}::vector
        LIMIT ${opts.limit}
      `;
    }

    const rows = await db.execute<{ id: string; distance: number }>(query);

    return rows.map((r) => ({
      statementId: r.id,
      score: r.distance,
    }));
  }
}
