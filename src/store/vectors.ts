import type { Embedder } from '../core/embedder.js';
import type { SearchBackend } from '../core/search.js';
import type { AppendStatementInput } from './statements.js';
import { appendStatement } from './statements.js';
import { HashEmbedder } from './embedders/hash.js';
import { PgvectorSearchBackend } from './search/pgvector.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

let currentEmbedder: Embedder = new HashEmbedder();
let currentBackend: SearchBackend = new PgvectorSearchBackend(currentEmbedder);

export function getEmbedder(): Embedder {
  return currentEmbedder;
}

export function setEmbedder(embedder: Embedder): void {
  currentEmbedder = embedder;
}

export function getBackend(): SearchBackend {
  return currentBackend;
}

export function setBackend(backend: SearchBackend): void {
  currentBackend = backend;
}

export async function appendAndIndex(
  input: Omit<AppendStatementInput, 'embedding'>,
): Promise<string> {
  if (input.content.length > env.LONG_CONTENT_WARN_CHARS) {
    logger.warn(
      { contentLength: input.content.length, threshold: env.LONG_CONTENT_WARN_CHARS },
      'appendAndIndex: content exceeds long-content threshold; embedding quality may degrade',
    );
  }

  let embedding: number[] | null = null;
  try {
    const [vec] = await currentEmbedder.embed([input.content]);
    embedding = vec ?? null;
  } catch (err) {
    logger.warn(
      { err, scope: input.scope, kind: input.kind },
      'appendAndIndex: embedding failed; proceeding without vector',
    );
  }

  return appendStatement({
    ...input,
    embedding,
  });
}
