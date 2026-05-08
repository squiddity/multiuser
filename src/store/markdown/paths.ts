import { join } from 'node:path';
import { env } from '../../config/env.js';

export type TranscriptChannel = 'narration' | 'party-chat' | 'steering';

function memoryRoot(): string {
  return env.MEMORY_ROOT;
}

/** ISO date string for today in local time: YYYY-MM-DD */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Absolute path to the daily transcript file for a given room+channel. */
export function transcriptPath(roomId: string, channel: TranscriptChannel, date?: string): string {
  return join(memoryRoot(), 'transcripts', roomId, channel, `${date ?? todayIso()}.md`);
}

/** Absolute path to the transcripts directory for a room+channel. */
export function transcriptDir(roomId: string, channel: TranscriptChannel): string {
  return join(memoryRoot(), 'transcripts', roomId, channel);
}

/** Absolute path for a briefing document. */
export function briefingPath(adminRoomId: string, date: string, sessionId: string): string {
  return join(memoryRoot(), 'briefings', adminRoomId, `${date}-${sessionId}.md`);
}

/** Absolute path to the memsearch index directory. */
export function memsearchIndexDir(): string {
  return env.MEMSEARCH_CONFIG_DIR ?? join(memoryRoot(), 'index');
}
