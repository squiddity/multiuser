#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { inspect } from 'node:util';
import postgres from 'postgres';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const DEMO_OPEN_QUESTION_ID = '77777777-7777-4777-8777-777777777777';
const RECALL_QUESTION = 'Who does the sigil on the north gate belong to?';

const shouldReset = process.env.DEMO_CLI_RESET !== '0';
const hasLiveResponder = Boolean(process.env.DEFAULT_MODEL_SPEC?.trim());
const showDbNotices = process.env.DEMO_SHOW_DB_NOTICES === '1';
const logLlmInput = process.env.DEMO_LOG_LLM_INPUT !== '0';
const demoScenario = (process.env.DEMO_SCENARIO?.trim() || 'vertical-slice').toLowerCase();

const SUPPORTED_SCENARIOS = new Set(['vertical-slice', 'briefing-only', 'steering-application']);

function createSql(databaseUrl) {
  return postgres(databaseUrl, {
    max: 1,
    onnotice: showDbNotices
      ? (notice) => process.stdout.write(`[db-notice] ${notice.message}\n`)
      : () => {},
  });
}

function buildSteps(scenario) {
  let t = 0;
  const steps = [];
  const add = (delayMs, input) => {
    t += delayMs;
    steps.push({ delayMs: t, input });
  };

  if (scenario === 'vertical-slice') {
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

  if (scenario === 'briefing-only') {
    add(1500, 'help');
    add(1000, '/ls');
    add(1000, "/say We found silver marks hidden under the ferryman's toll board.");
    // Add wait time after each /say for async briefing-generator to process
    add(3500, '/say Mara spotted a gate sigil matching the old marsh maps.');
    add(3500, '/ls');
    add(1500, 'room admin-1');
    add(1500, '/ls');
    // Wait for any pending briefing workers to complete
    add(3000, '/ls');
    add(1200, 'exit');
    return steps;
  }

  if (scenario === 'steering-application') {
    add(1500, 'help');
    add(1000, '/ls');
    // Baseline narration turn before any steering
    add(1000, '/say We approach the north gate in the dim dusk.');
    // Wait for narrator (if live) to respond
    add(hasLiveResponder ? 10000 : 1500, '/ls');

    // Switch to admin and issue steering
    add(1500, 'room admin-1');
    add(1000, '/steer tone Make the scene tense and ominous; no slapstick.');
    // Let steering-formalizer worker fire
    add(2500, '/ls');

    // Back to party and trigger another narration turn
    add(1500, 'room party-1');
    add(1000, '/say We step closer to the gate.');
    add(hasLiveResponder ? 12000 : 1500, '/ls');

    add(1200, 'exit');
    return steps;
  }

  throw new Error(`unsupported DEMO_SCENARIO: ${scenario}`);
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
         or (scope_type = 'world' and scope_key is null and kind = 'canon-reference' and author_id = 'decision-formalizer')
         or (scope_type = 'world' and scope_key is null and kind = 'canon-reference' and author_id = 'steering-formalizer')
    `;
    process.stdout.write(
      `[demo-driver] reset complete: removed ${result.count ?? 0} statement(s)\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function seedVerticalSliceOpenQuestion() {
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

function deriveOverall(checks) {
  const statuses = Object.values(checks).map((c) => c.status);
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('infra-flake')) return 'infra-flake';
  if (statuses.every((s) => s === 'pass')) return 'pass';
  return 'review';
}

async function assessVerticalSlice(sql) {
  const checks = {};

  const worldCanon = await sql`
    select content
    from statements
    where scope_type = 'world'
      and scope_key is null
      and kind = 'canon-reference'
      and author_id = 'decision-formalizer'
    order by created_at desc
    limit 1
  `;

  if (worldCanon.length > 0) {
    const content = worldCanon[0].content;
    process.stdout.write(`[demo-assess] latest world canon: ${content}\n`);
    checks.canon_promoted = {
      status: 'pass',
      reason: 'promoted canon-reference exists in world scope',
      evidence: { content },
    };
  } else {
    process.stdout.write('[demo-assess] no world canon-reference found\n');
    checks.canon_promoted = {
      status: 'fail',
      reason: 'no promoted canon-reference found in world scope',
    };
  }

  if (!hasLiveResponder) {
    process.stdout.write(
      '[demo-assess] live LLM responder not active (DEFAULT_MODEL_SPEC missing), skipped recall check\n',
    );
    checks.recall_mentions_canon = {
      status: 'not-run',
      reason: 'DEFAULT_MODEL_SPEC missing; recall check skipped',
    };
    return checks;
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
    checks.recall_mentions_canon = {
      status: 'review',
      reason: 'no narrator reply found after recall prompt',
    };
    return checks;
  }

  process.stdout.write(`[demo-assess] narrator recall answer: ${answer}\n`);
  const mentionsCanon = /ashen cartographers|cartographers guild/i.test(answer);
  process.stdout.write(
    `[demo-assess] qualitative check (mentions Ashen Cartographers): ${mentionsCanon ? 'PASS' : 'REVIEW'}\n`,
  );

  checks.recall_mentions_canon = {
    status: mentionsCanon ? 'pass' : 'review',
    reason: mentionsCanon
      ? 'narrator recall mentions canonized group'
      : 'narrator recall did not clearly mention canonized group',
    evidence: { answer },
  };

  return checks;
}

async function assessSteeringApplication(sql) {
  const checks = {};

  const steeringRows = await sql`
    select id, scope_type, scope_key, sources, fields
    from statements
    where scope_type = 'governance'
      and scope_key = ${ADMIN_ROOM_ID}
      and kind = 'steering'
    order by created_at desc
    limit 5
  `;

  if (steeringRows.length === 0) {
    process.stdout.write('[demo-assess] no steering statement found in admin governance scope\n');
    checks.steering_emitted = {
      status: 'review',
      reason: 'no steering emitted; formalizer may not have run or /steer failed',
    };
    checks.steering_applied_in_prompt = {
      status: 'not-run',
      reason: 'prompt inclusion check skipped because no steering exists',
    };
    return checks;
  }

  const latest = steeringRows[0];
  const fields = latest.fields ?? {};
  const scopeValid = latest.scope_type === 'governance' && latest.scope_key === ADMIN_ROOM_ID;
  const statusValid = fields.status === 'active';
  const hasSources = Array.isArray(latest.sources) && latest.sources.length > 0;

  checks.steering_emitted = {
    status: scopeValid && statusValid && hasSources ? 'pass' : 'review',
    reason:
      scopeValid && statusValid && hasSources
        ? 'steering statement emitted with active status and source linkage'
        : 'steering statement exists but fails one of: scope, status=active, source linkage',
    evidence: {
      statementId: latest.id,
      scopeType: latest.scope_type,
      scopeKey: latest.scope_key,
      status: fields.status,
      sourceCount: Array.isArray(latest.sources) ? latest.sources.length : 0,
    },
  };

  process.stdout.write(
    `[demo-assess] latest steering id=${latest.id} status=${fields.status ?? '(none)'}\n`,
  );

  if (!hasLiveResponder) {
    checks.steering_applied_in_prompt = {
      status: 'not-run',
      reason:
        'DEFAULT_MODEL_SPEC missing; narrator did not run so prompt inclusion is unverifiable',
    };
    return checks;
  }

  checks.steering_applied_in_prompt = {
    status: 'review',
    reason:
      'narrator ran with live model; verify prompt inclusion via DEMO_LOG_LLM_INPUT=1 logs (manual)',
  };

  return checks;
}

async function assessBriefingOnly(sql) {
  const checks = {};

  const rows = await sql`
    select id, scope_type, scope_key, content, sources
    from statements
    where scope_type = 'governance'
      and scope_key = ${ADMIN_ROOM_ID}
      and kind = 'briefing'
    order by created_at desc
    limit 1
  `;

  if (rows.length === 0) {
    process.stdout.write('[demo-assess] no briefing statement found in admin governance scope\n');
    checks.briefing_emitted = {
      status: 'review',
      reason: 'no briefing emitted yet (expected before PR2 wiring)',
    };
    checks.briefing_scope_valid = {
      status: 'not-run',
      reason: 'scope validation skipped because no briefing was emitted',
    };
    return checks;
  }

  const latest = rows[0];
  process.stdout.write(
    `[demo-assess] latest briefing id=${latest.id} sources=${Array.isArray(latest.sources) ? latest.sources.length : 0}\n`,
  );

  checks.briefing_emitted = {
    status: 'pass',
    reason: 'briefing statement emitted in governance scope',
    evidence: { statementId: latest.id },
  };

  const scopeValid = latest.scope_type === 'governance' && latest.scope_key === ADMIN_ROOM_ID;
  checks.briefing_scope_valid = {
    status: scopeValid ? 'pass' : 'fail',
    reason: scopeValid
      ? 'scope_type=governance and scope_key matches admin room'
      : 'briefing scope does not match expected governance/admin room',
    evidence: { scopeType: latest.scope_type, scopeKey: latest.scope_key },
  };

  return checks;
}

async function assessDemoResults({
  scenario,
  startedAt,
  finishedAt,
  childExitCode,
  childExitSignal,
}) {
  const databaseUrl = process.env.DATABASE_URL;

  const scorecard = {
    schemaVersion: '0.1',
    runId: `${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    scenarioId: scenario,
    milestone: scenario === 'vertical-slice' ? '0001' : '0002',
    // 'briefing-only' and 'steering-application' belong to milestone 0002
    modelSpec: process.env.DEFAULT_MODEL_SPEC ?? 'none',
    startedAt,
    finishedAt,
    overall: 'review',
    checks: {},
  };

  if (childExitCode !== 0 || childExitSignal) {
    scorecard.checks.runtime_exit = {
      status: 'infra-flake',
      reason: `demo child exited abnormally (code=${childExitCode}, signal=${childExitSignal})`,
    };
    scorecard.overall = 'infra-flake';
    process.stdout.write(`[demo-scorecard] ${JSON.stringify(scorecard)}\n`);
    return;
  }

  if (!databaseUrl) {
    scorecard.checks.database_available = {
      status: 'not-run',
      reason: 'DATABASE_URL missing; assessment queries skipped',
    };
    scorecard.overall = 'review';
    process.stdout.write(`[demo-scorecard] ${JSON.stringify(scorecard)}\n`);
    return;
  }

  const sql = createSql(databaseUrl);
  try {
    if (scenario === 'vertical-slice') {
      scorecard.checks = await assessVerticalSlice(sql);
    } else if (scenario === 'briefing-only') {
      scorecard.checks = await assessBriefingOnly(sql);
    } else if (scenario === 'steering-application') {
      scorecard.checks = await assessSteeringApplication(sql);
    } else {
      scorecard.checks = {
        scenario_supported: {
          status: 'fail',
          reason: `unsupported scenario ${scenario}`,
        },
      };
    }

    scorecard.overall = deriveOverall(scorecard.checks);
    process.stdout.write(`[demo-scorecard] ${JSON.stringify(scorecard)}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  if (!SUPPORTED_SCENARIOS.has(demoScenario)) {
    throw new Error(
      `DEMO_SCENARIO must be one of: ${[...SUPPORTED_SCENARIOS].join(', ')} (got: ${demoScenario})`,
    );
  }

  const startedAt = new Date().toISOString();

  if (shouldReset) {
    await resetDemoScopes();
  } else {
    process.stdout.write('[demo-driver] reset skipped (DEMO_CLI_RESET=0)\n');
  }

  if (demoScenario === 'vertical-slice') {
    await seedVerticalSliceOpenQuestion();
  }

  if (!hasLiveResponder) {
    process.stdout.write(
      '[demo-driver] DEFAULT_MODEL_SPEC is not set; demo will skip live narrator behavior\n',
    );
  }

  process.stdout.write(
    `[demo-driver] options: DEMO_SCENARIO=${demoScenario} DEMO_SHOW_DB_NOTICES=${showDbNotices ? '1' : '0'} DEMO_LOG_LLM_INPUT=${logLlmInput ? '1' : '0'}\n`,
  );

  const steps = buildSteps(demoScenario);

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
    await assessDemoResults({
      scenario: demoScenario,
      startedAt,
      finishedAt: new Date().toISOString(),
      childExitCode: code,
      childExitSignal: signal,
    });
    process.exit(code ?? (signal ? 1 : 0));
  });

  process.on('SIGINT', () => {
    process.stderr.write('\n[demo-driver] received SIGINT; forwarding to child\n');
    child.kill('SIGINT');
  });
}

main().catch((err) => {
  const detail =
    err instanceof Error ? err.stack || err.message : typeof err === 'string' ? err : inspect(err);
  process.stderr.write(`[demo-driver] fatal: ${detail}\n`);
  process.exit(1);
});
