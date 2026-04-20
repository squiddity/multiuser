#!/usr/bin/env node

import 'dotenv/config';
import { spawn } from 'node:child_process';
import postgres from 'postgres';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';

const shouldReset = process.env.DEMO_CLI_RESET !== '0';

const steps = [
  { delayMs: 1500, input: 'help' },
  { delayMs: 2500, input: '/ls' },
  { delayMs: 3500, input: '/say Bash live view drive-through' },
  { delayMs: 6500, input: '/ls' },
  { delayMs: 7500, input: 'room admin-1' },
  { delayMs: 8500, input: '/ls' },
  { delayMs: 10000, input: 'exit' },
];

async function resetDemoScopes() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for demo reset');
  }

  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const result = await sql`
      delete from statements
      where (scope_type = 'party' and scope_key = ${PARTY_ROOM_ID})
         or (scope_type = 'governance' and scope_key = ${ADMIN_ROOM_ID})
    `;
    process.stdout.write(`[demo-driver] reset complete: removed ${result.count ?? 0} statement(s)\n`);
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

  const child = spawn('pnpm', ['exec', 'tsx', 'src/cli/harness.ts'], {
    cwd: process.cwd(),
    env: process.env,
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
  }, 30000);

  child.on('exit', (code, signal) => {
    clearTimeout(forceExitTimer);
    process.stdout.write(`\n[demo-driver] child exited code=${code} signal=${signal}\n`);
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
