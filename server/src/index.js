import { config, assertProductionConfig } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { createApp } from './app.js';

async function main() {
  assertProductionConfig();
  if (!config.skipMigrations) await migrate();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info({ url: `http://${config.host}:${config.port}`, publicUrl: config.publicUrl }, 'API listening');
  });
  server.keepAliveTimeout = 65_000; // longer than Cloudflare's idle timeout
  server.headersTimeout = 66_000;

  const shutdown = (sig) => {
    logger.info({ sig }, 'shutting down');
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
