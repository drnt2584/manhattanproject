import { Router } from 'express';
import { query, tx } from '../db.js';
import { audit } from '../services/audit.js';
import { requestRun } from '../services/runner.js';
import { HttpError } from '../lib/errors.js';
import { pageParams, csvCell } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();

/** Send now. The worker picks the run up within a few seconds. */
r.post('/', async (req, res) => {
  const run = await requestRun({ trigger: 'manual', admin: req.admin });
  res.status(202).json({ run });
});

r.get('/', async (req, res) => {
  const { limit, offset } = pageParams(req.query, 100);
  const { rows } = await query(
    `SELECT r.*, s.name AS schedule_name, d.label AS source_label FROM runs r
       LEFT JOIN schedules s ON s.id = r.schedule_id LEFT JOIN data_sources d ON d.id = r.source_id
      ORDER BY r.id DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  res.json({ runs: rows });
});

r.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { rows: [run] } = await query(
    `SELECT r.*, s.name AS schedule_name, d.label AS source_label FROM runs r
       LEFT JOIN schedules s ON s.id = r.schedule_id LEFT JOIN data_sources d ON d.id = r.source_id WHERE r.id = $1`, [id]);
  if (!run) throw new HttpError(404, 'Run not found');
  const state = req.query.state ? String(req.query.state) : null;
  const { rows: recipients } = await query(
    `SELECT id, contact_name, row_number, channel, address, status_key, state, attempts, last_error, provider_message_id, sent_at, rendered_subject, rendered_body
       FROM run_recipients WHERE run_id = $1 AND ($2::text IS NULL OR state = $2)
      ORDER BY CASE channel WHEN 'email' THEN 1 WHEN 'none' THEN 2 ELSE 0 END, row_number LIMIT 5000`, [id, state]);
  const { rows: progress } = await query(
    'SELECT channel, state, count(*)::int AS n FROM run_recipients WHERE run_id = $1 GROUP BY channel, state', [id]);
  res.json({ run, recipients, progress });
});

r.post('/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  const run = await tx(async (c) => {
    const { rows: [cur] } = await c.query('SELECT * FROM runs WHERE id = $1 FOR UPDATE', [id]);
    if (!cur) throw new HttpError(404, 'Run not found');
    let updated;
    if (cur.status === 'queued') {
      ({ rows: [updated] } = await c.query("UPDATE runs SET status = 'cancelled', cancel_requested = TRUE, finished_at = now() WHERE id = $1 RETURNING *", [id]));
    } else if (cur.status === 'running') {
      ({ rows: [updated] } = await c.query('UPDATE runs SET cancel_requested = TRUE WHERE id = $1 RETURNING *', [id]));
    } else {
      throw new HttpError(409, `Run is already ${cur.status}`);
    }
    await audit({ event: 'run_cancel_requested', actor: actor(req), run_id: id, details: { previous_status: cur.status } }, c);
    return updated;
  });
  res.json({ run });
});

r.get('/:id/failures.csv', async (req, res) => {
  const { rows } = await query(
    `SELECT row_number, contact_name, channel, address, status_key, attempts, last_error
       FROM run_recipients WHERE run_id = $1 AND state = 'failed' ORDER BY row_number`, [Number(req.params.id)]);
  const head = ['row_number', 'contact_name', 'channel', 'address', 'status', 'attempts', 'error'];
  const body = rows.map((x) => [x.row_number, x.contact_name, x.channel, x.address, x.status_key, x.attempts, x.last_error].map(csvCell).join(','));
  res.type('text/csv').attachment(`run-${req.params.id}-failures.csv`).send([head.join(','), ...body].join('\n'));
});

export default r;
