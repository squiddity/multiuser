import type { TranscriptChannel } from './paths.js';
import { TranscriptWriter } from './transcript-writer.js';

type RegistryKey = string; // `${roomId}:${channel}`

function key(roomId: string, channel: TranscriptChannel): RegistryKey {
  return `${roomId}:${channel}`;
}

/**
 * Process-local registry of open TranscriptWriters, one per (roomId, channel).
 * Callers share the same writer instance for a given room+channel combination.
 */
export class TranscriptRegistry {
  private readonly writers = new Map<RegistryKey, TranscriptWriter>();

  get(roomId: string, channel: TranscriptChannel): TranscriptWriter {
    const k = key(roomId, channel);
    let writer = this.writers.get(k);
    if (!writer) {
      writer = new TranscriptWriter(roomId, channel);
      this.writers.set(k, writer);
    }
    return writer;
  }

  /** End all open session blocks, e.g. on graceful shutdown. */
  async endAll(endedAt?: Date): Promise<void> {
    const at = endedAt ?? new Date();
    await Promise.all([...this.writers.values()].map((w) => w.end(at)));
  }
}

/** Singleton registry for the process. */
export const transcriptRegistry = new TranscriptRegistry();
