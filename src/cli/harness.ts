import readline from 'node:readline';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { close, ping } from '../store/client.js';
import { migrate } from '../store/migrate.js';
import { seed } from '../store/seed.js';
import { WorkerRegistry } from '../core/worker.js';
import { CronerScheduler } from '../scheduler/croner-impl.js';
import { EventBus } from '../core/events.js';
import { liveResponderWorker } from '../workers/live-responder.js';
import { openQuestionResolverWorker } from '../workers/open-question-resolver.js';
import { appendIndexAndEmit } from '../store/emit.js';
import { listByScope, getStatement } from '../store/statements.js';
import { canonizeOpenQuestion, CanonizeError } from '../store/canonize.js';
import type { StatementEvent } from '../core/events.js';
import type { Scope } from '../core/statement.js';

interface RoomContext {
  id: string;
  name: string;
  userId: string;
  writeScope: Scope;
}

const PARTY_ROOM: RoomContext = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'party-1',
  userId: 'simulated-user-1',
  writeScope: { type: 'party', partyId: '11111111-1111-1111-1111-111111111111' },
};
const ADMIN_ROOM: RoomContext = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'admin-1',
  userId: 'simulated-user-2',
  writeScope: { type: 'governance', roomId: '22222222-2222-2222-2222-222222222222' },
};
const ROOMS: Record<string, RoomContext> = {
  'party-1': PARTY_ROOM,
  'admin-1': ADMIN_ROOM,
};

let currentRoom: RoomContext = PARTY_ROOM;

// --- formatting helpers ---

const KIND_WIDTH = 14;

function scopeLabel(scopeType: string): string {
  const short: Record<string, string> = {
    party: 'party',
    world: 'world',
    governance: 'gov',
    meta: 'meta',
    character: 'char',
  };
  return short[scopeType] ?? scopeType;
}

function fmtStatement(row: {
  kind: string;
  scopeType: string;
  authorId: string;
  content: string;
  fields: Record<string, unknown>;
}): string {
  const k = row.kind.padEnd(KIND_WIDTH);
  const s = scopeLabel(row.scopeType);
  const who = row.authorId;

  if (row.kind === 'open-question') {
    const subject = (row.fields.subject as string | undefined) ?? '';
    const candidate = (row.fields.candidate as string | undefined) ?? '';
    return `  ◎ ${k} [${s} / ${who}]  ${subject} → ${candidate}`;
  }

  const preview = row.content.length > 120 ? row.content.slice(0, 117) + '...' : row.content;
  return `  ◎ ${k} [${s} / ${who}]  ${preview}`;
}

// --- readline setup ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

function prompt(): void {
  rl.setPrompt(`[${currentRoom.name} / ${currentRoom.userId}] > `);
  rl.prompt();
}

function printLine(msg: string): void {
  readline.clearLine(process.stdout, 0);
  readline.cursorTo(process.stdout, 0);
  console.log(msg);
  rl.prompt(true);
}

// --- command handlers ---

function handleRoom(args: string[]): void {
  const name = args[0];
  if (!name || !ROOMS[name]) {
    printLine(`  unknown room "${name}". choices: ${Object.keys(ROOMS).join(', ')}`);
    return;
  }
  currentRoom = ROOMS[name]!;
  printLine(`  switched to ${currentRoom.name} as ${currentRoom.userId}`);
  prompt();
}

async function handleSay(events: EventBus, text: string): Promise<void> {
  if (!text.trim()) {
    printLine('  usage: /say <text>');
    return;
  }
  await appendIndexAndEmit(
    {
      scope: currentRoom.writeScope,
      kind: 'dialogue',
      authorType: 'user',
      authorId: currentRoom.userId,
      content: text.trim(),
      icOoc: 'ic',
    },
    events,
  );
}

async function handleCanonize(events: EventBus, args: string[]): Promise<void> {
  const [oqId, decision, ...rest] = args;
  if (!oqId || !decision) {
    printLine('  usage: /canonize <oq-id> promote|reject|supersede [revised text...]');
    return;
  }
  if (!['promote', 'reject', 'supersede'].includes(decision)) {
    printLine('  decision must be promote, reject, or supersede');
    return;
  }
  const revisedCandidate = rest.length > 0 ? rest.join(' ') : undefined;

  try {
    await canonizeOpenQuestion(
      {
        userId: currentRoom.userId,
        roomId: currentRoom.id,
        openQuestionId: oqId,
        decision: decision as 'promote' | 'reject' | 'supersede',
        revisedCandidate,
      },
      events,
    );
    printLine(`  canonized: ${decision}`);
  } catch (err) {
    if (err instanceof CanonizeError) {
      printLine(`  error: ${err.message}`);
    } else {
      throw err;
    }
  }
}

async function handleLs(): Promise<void> {
  const rows = await listByScope(currentRoom.writeScope, { limit: 10 });
  if (rows.length === 0) {
    printLine('  (no statements)');
    return;
  }
  for (const row of [...rows].reverse()) {
    printLine(
      fmtStatement({
        kind: row.kind,
        scopeType: row.scopeType,
        authorId: row.authorId,
        content: row.content,
        fields: row.fields as Record<string, unknown>,
      }),
    );
  }
}

function printHelp(): void {
  printLine(
    [
      '  commands:',
      '    room <name>                              switch room (party-1, admin-1)',
      '    /say <text>                              emit dialogue as current user',
      '    /canonize <oq-id> promote|reject|..     decide an open question',
      '    /ls                                      list recent statements',
      '    help                                     show this',
      '    exit                                     quit',
    ].join('\n'),
  );
}

// --- main ---

async function main(): Promise<void> {
  await ping();
  await migrate();
  await seed();

  const events = new EventBus();
  const workers = new WorkerRegistry();
  const scheduler = new CronerScheduler(workers, logger, events);

  workers.register(openQuestionResolverWorker);
  await scheduler.schedule(
    { type: 'event', predicate: { kind: 'authoring-decision', scopeType: 'governance' } },
    'open-question-resolver',
    {},
  );

  if (env.DEFAULT_MODEL_SPEC) {
    workers.register(liveResponderWorker);
    const liveConfig = { adminRoomId: ADMIN_ROOM.id, modelSpec: env.DEFAULT_MODEL_SPEC };
    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'dialogue', scopeType: 'party' } },
      'live-responder',
      liveConfig,
    );
    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'pose', scopeType: 'party' } },
      'live-responder',
      liveConfig,
    );
  } else {
    console.log(
      '\n  ⚠  DEFAULT_MODEL_SPEC not set — narrator will not respond to /say\n' +
        '     set DEFAULT_MODEL_SPEC (e.g. anthropic:claude-haiku-4-5) in .env\n',
    );
  }

  await scheduler.start();

  // stream new statements to the console
  events.on<StatementEvent>('statement:created', async (event) => {
    try {
      const row = await getStatement(event.id);
      if (!row) return;
      // skip echoing the user's own dialogue back
      if (row.kind === 'dialogue' && row.authorType === 'user') return;
      printLine(
        fmtStatement({
          kind: row.kind,
          scopeType: row.scopeType,
          authorId: row.authorId,
          content: row.content,
          fields: row.fields as Record<string, unknown>,
        }),
      );
    } catch {
      // don't crash the REPL on a display error
    }
  });

  console.log('\n  multiuser CLI  —  milestone 0001 vertical slice');
  console.log('  type "help" for commands\n');
  prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    const [cmd, ...rest] = trimmed.split(/\s+/);

    try {
      if (cmd === 'exit') {
        await scheduler.stop();
        await close();
        process.exit(0);
      } else if (cmd === 'room') {
        handleRoom(rest);
      } else if (cmd === '/say') {
        await handleSay(events, rest.join(' '));
      } else if (cmd === '/canonize') {
        await handleCanonize(events, rest);
      } else if (cmd === '/ls') {
        await handleLs();
      } else if (cmd === 'help') {
        printHelp();
      } else {
        printLine(`  unknown command "${cmd}". type "help" for commands`);
      }
    } catch (err) {
      printLine(`  error: ${String(err)}`);
    }

    prompt();
  });

  rl.on('close', async () => {
    await scheduler.stop();
    await close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
