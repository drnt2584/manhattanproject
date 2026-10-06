import { CronExpressionParser } from 'cron-parser';
import { tx } from '../db.js';
import { audit } from './audit.js';
import { requestRun } from './runner.js';
import { HttpError } from '../lib/errors.js';

export function nextCronRun(cron, timezone, from = new Date()) {
  try {
    return CronExpressionParser.parse(cron, { tz: timezone, currentDate: from }).next().toDate();
  } catch (err) {
    throw new HttpError(400, `Invalid repeat rule "${cron}": ${err.message}`);
  }
}

/** Turn due schedules into queued runs. Safe to call from several workers. */
export async function promoteDueSchedules() {
  return tx(async (c) => {
    const { rows } = await c.query(
      "SELECT * FROM schedules WHERE status = 'active' AND next_run_at <= now() ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 20");
    for (const s of rows) {
      const run = await requestRun({ trigger: 'schedule', scheduleId: s.id }, c);
      const next = s.cron ? nextCronRun(s.cron, s.timezone, new Date(Math.max(Date.now(), new Date(s.next_run_at).getTime()) + 1000)) : null;
      await c.query(
        'UPDATE schedules SET last_run_id = $2, next_run_at = $3, status = $4 WHERE id = $1',
        [s.id, run.id, next, next ? 'active' : 'completed'],
      );
      await audit({ event: 'schedule_fired', actor: 'scheduler', run_id: run.id, details: { schedule_id: s.id, name: s.name, next_run_at: next } }, c);
    }
    return rows.length;
  });
}
