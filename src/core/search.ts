import type { ScopePattern } from '../core/room.js';

export interface SearchResult {
  statementId: string;
  score: number;
  chunkIndex?: number;
}

export interface SearchOptions {
  text: string;
  limit: number;
  kind?: string;
}

export interface SearchBackend {
  search(patterns: ScopePattern[], opts: SearchOptions): Promise<SearchResult[]>;
}
