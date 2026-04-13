import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { close, ping } from './store/client.js';
import { WorkerRegistry } from './core/worker.js';
import { ResolverRegistry } from './resolvers/registry.js';
import { CronerScheduler } from './scheduler/croner-impl.js';

async function main(): Promise<void> {
  logger.info({ env: env.NODE_ENV }, 'starting multiuser');

  await ping();
  logger.info('database reachable');

  const workers = new WorkerRegistry();
  const resolvers = new ResolverRegistry();
  const scheduler = new CronerScheduler(workers, logger);
  await scheduler.start();

  logger.info(
    { workers: workers.list(), resolvers: resolvers.list() },
    'ready',
  );

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
