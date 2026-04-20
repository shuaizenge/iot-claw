import { logger } from './logger.js';
import { Orchestrator } from './orchestrator.js';

const orchestrator = new Orchestrator();

async function main(): Promise<void> {
  await orchestrator.start();
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown requested');
  try {
    await orchestrator.stop();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Shutdown failed');
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
