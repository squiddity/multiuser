#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'node:child_process';
import postgres from 'postgres';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_OPEN_QUESTION_ID = '77777777-7777-4777-8777-777777777777';
const RECALL_QUESTION = 'Who does the sigil on the north gate belong to?';

const shouldReset = process.env.DEMO_CLI_RESET !== '0';
const hasLiveResponder = Boolean(process.env.DEFAULT_MODEL_SPEC?.trim());
const showDbNotices = process.env.DEMO_SHOW_DB_NOTICES === '1';
const logLlmInput = process.env.DEMO_LOG_LLM_INPUT !== '0';

function createSql(databaseUrl) {
  return postgres(databaseUrl, {
    max: 1,
    onnotice: showDbNotices ? (notice) => process.stdout.write(`[db-notice] ${notice.message}\n`) : () => {},
  });
}

function buildSteps() {
  let t = 0;
  const steps = [];
  const add = (delayMs, input) => {
    t += delayMs;
    steps.push({ delayMs: t, input });
  };

  add(1500, 'help');
  add(1000, '/ls');
  add(1000, '/narrate The tavern lanterns flicker as a cold draft sweeps in.');
  add(1500, '/ls');
  add(1500, 'room admin-1');
  add(1200, '/ls');
  add(1400, `/canonize ${DEMO_OPEN_QUESTION_ID} promote`);
  add(2500, '/ls');

  if (hasLiveResponder) {
    add(1500, 'room party-1');
    add(1200, `/say ${RECALL_QUESTION}`);
    add(12000, '/ls');
  }

  add(1500, 'exit');

  return steps;
}

async function resetDemoScopes() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for demo reset');

  const sql = createSql(databaseUrl);
  try {
    const result = await sql`
      delete from statements
      where (scope_type = 'party' and scope_key = ${PARTY_ROOM_ID})
         or (scope_type = 'governance' and scope_key = ${ADMIN_ROOM_ID})
         or (scope_type = 'world' and scope_key is null and kind = 'canon-reference' and author_id = 'steering-formalizer')
    `;
    process.stdout.write(`[demo-driver] reset complete: removed ${result.count ?? 0} statement(s)\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedDemoOpenQuestion() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for demo seed');

  const sql = createSql(databaseUrl);
  try {
    await sql`
      insert into statements (
        id, scope_type, scope_key, kind, author_type, author_id, content, fields, sources
      )
      values (
        ${DEMO_OPEN_QUESTION_ID},
        'governance',
        ${ADMIN_ROOM_ID},
        'open-question',
        'agent',
        'narrator',
        'Subject: Gate sigil ownership\n\nCandidate: The sigil on the north gate belongs to the Ashen Cartographers guild.',
        ${JSON.stringify({
          subject: 'Gate sigil ownership',
          candidate: 'The sigil on the north gate belongs to the Ashen Cartographers guild.',
          routedTo: ADMIN_ROOM_ID,
          blocks: [],
          stage: 'deferred',
        })}::jsonb,
        '{}'::uuid[]
      )
      on conflict (id) do nothing
    `;
    process.stdout.write(`[demo-driver] seeded open-question ${DEMO_OPEN_QUESTION_ID}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function assessDemoResults() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  const sql = createSql(databaseUrl);
  try {
    const worldCanon = await sql`
      select content
      from statements
      where scope_type = 'world'
        and scope_key is null
        and kind = 'canon-reference'
        and author_id = 'steering-formalizer'
      order by created_at desc
      limit 1
    `;

    if (worldCanon.length > 0) {
      process.stdout.write(`[demo-assess] latest world canon: ${worldCanon[0].content}\n`);
    } else {
      process.stdout.write('[demo-assess] no world canon-reference found\n');
    }

    if (!hasLiveResponder) {
      process.stdout.write(
        '[demo-assess] live LLM responder not active (DEFAULT_MODEL_SPEC missing), skipped recall check\n',
      );
      return;
    }

    const narratorRows = await sql`
      select content
      from statements
      where scope_type = 'party'
        and scope_key = ${PARTY_ROOM_ID}
        and author_type = 'agent'
        and author_id = 'narrator'
      order by created_at desc
      limit 5
    `;

    const answer = narratorRows.find((r) =>
      typeof r.content === 'string'
        ? !r.content.includes('The tavern lanterns flicker as a cold draft sweeps in.')
        : false,
    )?.content;

    if (!answer) {
      process.stdout.write('[demo-assess] no narrator reply found after recall prompt\n');
      return;
    }

    process.stdout.write(`[demo-assess] narrator recall answer: ${answer}\n`);

    const mentionsCanon = /ashen cartographers|cartographers guild/i.test(answer);
    process.stdout.write(
      `[demo-assess] qualitative check (mentions Ashen Cartographers): ${mentionsCanon ? 'PASS' : 'REVIEW'}\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  if (shouldReset) {
    await resetDemoScopes();
  } else {
    process.stdout.write('[demo-driver] reset skipped (DEMO_CLI_RESET=0)\n');
  }

  await seedDemoOpenQuestion();

  if (!hasLiveResponder) {
    process.stdout.write(
      '[demo-driver] DEFAULT_MODEL_SPEC is not set; demo will skip /say recall question\n',
    );
  }

  process.stdout.write(
    `[demo-driver] options: DEMO_SHOW_DB_NOTICES=${showDbNotices ? '1' : '0'} DEMO_LOG_LLM_INPUT=${logLlmInput ? '1' : '0'}\n`,
  );

  const steps = buildSteps();

  const childEnv = {
    ...process.env,
    LOG_DB_NOTICES: showDbNotices ? '1' : '0',
    LOG_LLM_INPUT: logLlmInput ? '1' : '0',
  };

  const child = spawn('pnpm', ['exec', 'tsx', 'src/cli/harness.ts'], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  for (const step of steps) {
    setTimeout(() => {
      process.stdout.write(`\n>>> ${step.input}\n`);
      child.stdin.write(`${step.input}\n`);
    }, step.delayMs);
  }

  const forceExitTimer = setTimeout(() => {
    process.stderr.write('\n[demo-driver] timeout waiting for process exit; sending SIGTERM\n');
    child.kill('SIGTERM');
  }, 70000);

  child.on('exit', async (code, signal) => {
    clearTimeout(forceExitTimer);
    process.stdout.write(`\n[demo-driver] child exited code=${code} signal=${signal}\n`);
    await assessDemoResults();
    process.exit(code ?? (signal ? 1 : 0));
  });

  process.on('SIGINT', () => {
    process.stderr.write('\n[demo-driver] received SIGINT; forwarding to child\n');
    child.kill('SIGINT');
  });
}

main().catch((err) => {
  process.stderr.write(`[demo-driver] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
