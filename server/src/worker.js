import { config, assertProductionConfig } from './config.js';
import { logger } from './logger.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { claimRun, executeRun } from './services/runner.js';
import { promoteDueSchedules } from './services/schedules.js';
import { maybeQueueDailyReminders } from './services/reminders.js';
import { telegramPollLoop } from './services/telegramBot.js';
import { pollImap } from './services/imap.js';
import { sleep } from './lib/concurrency.js';

let stopping = false;

async function schedulerLoop() {
  while (!stopping) {
    try {
      await promoteDueSchedules();
      await maybeQueueDailyReminders();
      let run;
      while (!stopping && (run = await claimRun())) {
        logger.info({ runId: run.id, trigger: run.trigger }, 'run claimed');
        await executeRun(run);
      }
    } catch (err) {
      logger.error({ err }, 'worker loop error');
    }
    await sleep(config.worker.pollMs);
  }
}

async function imapLoop() {
  if (!config.email.imapEnabled) return;
  while (!stopping) {
    try {
      await pollImap();
    } catch (err) {
      logger.error({ err: err.message }, 'IMAP poll failed');
    }
    await sleep(config.email.imapPollMs);
  }
}

async function main() {
  assertProductionConfig();
  if (!config.skipMigrations) await migrate();
  logger.info({ chat: config.chatChannel, whatsapp: config.whatsapp.provider, telegram: config.telegram.botToken ? 'bot' : 'mock', email: config.email.provider, imap: config.email.imapEnabled }, 'worker started');
  await Promise.all([schedulerLoop(), imapLoop(), telegramPollLoop(() => stopping)]);
  await pool.end();
  logger.info('worker stopped');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    logger.info({ sig }, 'worker shutting down after current step');
    stopping = true;
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
