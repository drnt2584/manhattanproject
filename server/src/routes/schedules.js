import { Router } from 'express';
import { z } from 'zod';
import { query, tx } from '../db.js';
import { config } from '../config.js';
import { audit } from '../services/audit.js';
import { nextCronRun } from '../services/schedules.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();

r.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT s.*, r.status AS last_run_status FROM schedules s LEFT JOIN runs r ON r.id = s.last_run_id
      ORDER BY (s.status = 'active') DESC, s.next_run_at ASC NULLS LAST, s.id DESC LIMIT 100`);
  res.json({ schedules: rows, timezone: config.timezone });
});

/**
 * Create a schedule. Either a one-time `run_at` (ISO date-time) or a repeating
 * `cron` rule ("0 9 * * 1" = Mondays 09:00) evaluated in `timezone`.
 */
r.post('/', async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(1).max(200),
    run_at: z.string().datetime({ offset: true }).optional(),
    cron: z.string().trim().max(100).optional(),
    timezone: z.string().default(config.timezone),
  }).refine((v) => v.run_at || v.cron, 'Choose a date/time or a repeat rule'), req.body);
  try {
    new Intl.DateTimeFormat('en', { timeZone: b.timezone });
  } catch {
    throw new HttpError(400, `Unknown timezone ${b.timezone}`);
  }
  let next;
  if (b.cron) {
    next = nextCronRun(b.cron, b.timezone, b.run_at ? new Date(b.run_at) : new Date());
  } else {
    next = new Date(b.run_at);
    if (next.getTime() < Date.now() - 60_000) throw new HttpError(400, 'That time is in the past');
  }
  const row = await tx(async (c) => {
    const { rows: [s] } = await c.query(
      'INSERT INTO schedules (name, next_run_at, cron, timezone, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [b.name, next, b.cron || null, b.timezone, req.admin.id]);
    await audit({ event: 'schedule_created', actor: actor(req), details: s }, c);
    return s;
  });
  res.status(201).json({ schedule: row });
});

r.post('/:id/cancel', async (req, res) => {
  const row = await tx(async (c) => {
    const { rows: [s] } = await c.query(
      `UPDATE schedules SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2
        WHERE id = $1 AND status = 'active' RETURNING *`, [Number(req.params.id), req.admin.id]);
    if (!s) throw new HttpError(404, 'No active schedule with that id');
    await audit({ event: 'schedule_cancelled', actor: actor(req), details: { schedule_id: s.id, name: s.name } }, c);
    return s;
  });
  res.json({ schedule: row });
});

export default r;
