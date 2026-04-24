import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { close, ping } from './store/client.js';
import { migrate } from './store/migrate.js';
import { seed } from './store/seed.js';
import { runSmoke } from './store/smoke.js';
import { WorkerRegistry } from './core/worker.js';
import { ResolverRegistry } from './resolvers/registry.js';
import { CronerScheduler } from './scheduler/croner-impl.js';
import { EventBus } from './core/events.js';
import { createApp, getPort } from './api/app.js';
import { liveResponderWorker } from './workers/live-responder.js';
import { openQuestionResolverWorker } from './workers/open-question-resolver.js';
import { steeringFormalizerWorker } from './workers/steering-formalizer.js';
import { serve } from '@hono/node-server';

const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';

async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'starting multiuser');

  await ping();
  logger.info('database reachable');

  await migrate();
  logger.info('schema ready');

  if (env.NODE_ENV !== 'production') {
    await seed();
    logger.info('dev seed applied');
    await runSmoke(logger);
  }

  const events = new EventBus();
  const workers = new WorkerRegistry();
  const resolvers = new ResolverRegistry();
  const scheduler = new CronerScheduler(workers, logger, events);

  if (env.DEFAULT_MODEL_SPEC) {
    workers.register(liveResponderWorker);
    const liveConfig = { adminRoomId: ADMIN_ROOM_ID, modelSpec: env.DEFAULT_MODEL_SPEC };
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
    logger.info({ modelSpec: env.DEFAULT_MODEL_SPEC }, 'live-responder registered');
  } else {
    logger.info('DEFAULT_MODEL_SPEC not set; live-responder not registered');
  }

  workers.register(openQuestionResolverWorker);
  await scheduler.schedule(
    { type: 'event', predicate: { kind: 'authoring-decision', scopeType: 'governance' } },
    'open-question-resolver',
    {},
  );
  logger.info('open-question-resolver registered');

  workers.register(steeringFormalizerWorker);
  await scheduler.schedule(
    { type: 'event', predicate: { kind: 'steering-request', scopeType: 'governance' } },
    'steering-formalizer',
    {},
  );
  logger.info('steering-formalizer registered');

  await scheduler.start();

  const app = createApp(events);
  const port = getPort();
  const server = serve({
    fetch: app.fetch,
    port,
  });
  logger.info({ port }, 'http server started');

  logger.info({ workers: workers.list(), resolvers: resolvers.list() }, 'ready');

  const shutdown = async (sig: string) => {
    logger.info({ sig }, 'shutting down');
    await scheduler.stop();
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal');
  process.exit(1);
});
