import type { Embedder } from '../../core/embedder.js';
import { env } from '../../config/env.js';

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const MASK32 = 0xffffffff;

function fnv1a(data: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = (hash * FNV_PRIME) & MASK32;
  }
  return hash >>> 0;
}

export class HashEmbedder implements Embedder {
  readonly dim: number;

  constructor(dim?: number) {
    this.dim = dim ?? env.EMBED_DIM;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return new Array(this.dim).fill(0);
    }

    const bag = new Float64Array(this.dim);
    for (const token of tokens) {
      const idx = fnv1a(token) % this.dim;
      bag[idx] = (bag[idx] ?? 0) + 1;
    }

    let norm = 0;
    for (let i = 0; i < bag.length; i++) {
      norm += bag[i]! * bag[i]!;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) {
      return Array.from(bag);
    }
    for (let i = 0; i < bag.length; i++) {
      bag[i]! /= norm;
    }

    return Array.from(bag);
  }
}
