import { mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TranscriptChannel } from './paths.js';
import { transcriptPath, todayIso } from './paths.js';

/** Writes session-anchored markdown transcript lines for one (roomId, channel) pair. */
export class TranscriptWriter {
  private readonly roomId: string;
  private readonly channel: TranscriptChannel;
  private currentDate: string;
  private sessionId: string | null = null;

  constructor(roomId: string, channel: TranscriptChannel) {
    this.roomId = roomId;
    this.channel = channel;
    this.currentDate = todayIso();
  }

  private currentPath(): string {
    return transcriptPath(this.roomId, this.channel, this.currentDate);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(dirname(this.currentPath()), { recursive: true });
  }

  private async write(text: string): Promise<void> {
    await this.ensureDir();
    await appendFile(this.currentPath(), text, 'utf-8');
  }

  /** Begin a new session block. Call once per pi-agent session start. */
  async start(sessionId: string, startedAt: Date): Promise<void> {
    this.sessionId = sessionId;
    this.currentDate = todayIso();
    const iso = startedAt.toISOString();
    const heading = new Date(startedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const header =
      `# ${this.channel} — room ${this.roomId} — ${this.currentDate}\n\n` +
      `<!-- session:${sessionId} start=${iso} -->\n` +
      `## Session ${heading}\n\n`;

    await this.write(header);
  }

  /** Append a single line to the current transcript. */
  async append(actor: string, text: string, at?: Date): Promise<void> {
    const ts = (at ?? new Date()).toISOString();
    await this.write(`[${ts}] ${actor}: ${text}\n`);
  }

  /** Close the current session block. Call once per pi-agent session end. */
  async end(endedAt: Date): Promise<void> {
    if (!this.sessionId) return;
    const iso = endedAt.toISOString();
    await this.write(`\n<!-- session:${this.sessionId} end=${iso} -->\n\n`);
    this.sessionId = null;
  }
}
