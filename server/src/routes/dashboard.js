import { Router } from 'express';
import { query } from '../db.js';
import { config, chatChannels } from '../config.js';
import { activeSource } from '../services/sources.js';

const r = Router();

r.get('/', async (_req, res) => {
  const [source, nextSchedule, runs, unread, totals, contacts, missingTemplates, daily] = await Promise.all([
    activeSource(),
    query("SELECT * FROM schedules WHERE status = 'active' ORDER BY next_run_at LIMIT 1").then((x) => x.rows[0] ?? null),
    query('SELECT * FROM runs ORDER BY id DESC LIMIT 8').then((x) => x.rows),
    query("SELECT count(*)::int AS n FROM messages WHERE direction = 'inbound' AND NOT is_read").then((x) => x.rows[0].n),
    query(`SELECT channel, count(*) FILTER (WHERE state = 'sent')::int AS sent, count(*) FILTER (WHERE state = 'failed')::int AS failed
             FROM run_recipients rr JOIN runs r ON r.id = rr.run_id WHERE r.created_at > now() - interval '30 days' GROUP BY channel`).then((x) => x.rows),
    query(`SELECT count(*)::int AS total, count(whatsapp)::int AS whatsapp, count(email)::int AS email,
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM telegram_links t WHERE t.phone = c.whatsapp AND t.blocked_at IS NULL))::int AS telegram,
                  count(*) FILTER (WHERE jsonb_array_length(warnings) > 0)::int AS warnings
             FROM contacts c JOIN data_sources s ON s.id = c.source_id AND s.is_active`).then((x) => x.rows[0]),
    query(`SELECT DISTINCT c.status FROM contacts c JOIN data_sources s ON s.id = c.source_id AND s.is_active
             WHERE c.status IS NOT NULL AND NOT EXISTS (SELECT 1 FROM templates t WHERE t.status_key = c.status OR t.status_key = '*')`).then((x) => x.rows.map((y) => y.status)),
    query(`SELECT to_char(date_trunc('day', a.ts AT TIME ZONE $1), 'YYYY-MM-DD') AS day,
                  count(*) FILTER (WHERE a.event = 'message_sent')::int AS sent,
                  count(*) FILTER (WHERE a.event = 'send_failed' AND a.status = 'failed')::int AS failed,
                  count(*) FILTER (WHERE a.event = 'reply_received')::int AS replies
             FROM audit_log a WHERE a.ts > now() - interval '14 days' GROUP BY 1 ORDER BY 1`, [config.timezone]).then((x) => x.rows),
  ]);
  res.json({ chatChannels: chatChannels(), source, nextSchedule, runs, unread, totals, contacts, missingTemplates, daily, timezone: config.timezone });
});

export default r;
