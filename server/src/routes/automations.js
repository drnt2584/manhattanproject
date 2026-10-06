import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { getAllSettings, saveSetting } from '../services/settings.js';
import { reminderPlan, contactKey } from '../services/reminders.js';
import { requestRun } from '../services/runner.js';
import { balanceReplyText } from '../services/automations.js';
import { activeSource } from '../services/sources.js';
import { normalizePhone, normalizeEmail } from '../lib/normalize.js';
import { todayIso } from '../lib/dates.js';
import { HttpError } from '../lib/errors.js';
import { parse, csvCell } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();
const words = z.array(z.string().trim().min(1).max(60)).max(50);
const text = z.string().trim().min(1).max(4000);

const SCHEMAS = {
  reminders: z.object({
    enabled: z.boolean(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)'),
    unpaid_statuses: words.min(1),
    rules: z.array(z.object({ days: z.number().int().min(0).max(365), template: z.string().trim().min(1).max(100) })).min(1).max(10)
      .refine((rs) => new Set(rs.map((x) => x.days)).size === rs.length, 'Each reminder needs a different number of days'),
  }),
  privacy: z.object({
    enabled: z.boolean(), notice: text, accepted_reply: text, declined_reply: text, invalid_reply: text, yes_words: words.min(1), no_words: words.min(1),
  }),
  balance: z.object({
    enabled: z.boolean(), keywords: words.min(1), reply: text, paid_reply: text, not_found_reply: text,
  }),
};

r.get('/', async (_req, res) => {
  const settings = await getAllSettings();
  const { rows: [last] } = await query("SELECT value FROM settings WHERE key = 'reminders_last_run'");
  const { rows: counts } = await query('SELECT status, count(*)::int AS n FROM consents GROUP BY status');
  res.json({ settings, lastReminderRun: last?.value ?? null, consents: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

r.put('/:key', async (req, res) => {
  const schema = SCHEMAS[req.params.key];
  if (!schema) throw new HttpError(404, 'Unknown automation');
  const value = parse(schema, req.body);
  // Don't let an automatic message go out with "[DPO email or phone]" still in it
  const placeholder = Object.values(value).filter((v) => typeof v === 'string').join('\n').match(/\[[A-Za-z][^\]\n]{2,60}\]/);
  if (value.enabled && placeholder) throw new HttpError(400, `Replace the placeholder ${placeholder[0]} before turning this on`);
  if (req.params.key === 'reminders') {
    value.unpaid_statuses = value.unpaid_statuses.map((s) => s.toLowerCase());
    value.rules.sort((a, b) => a.days - b.days);
  }
  await saveSetting(req.params.key, value, req.admin.id);
  await audit({ event: 'automation_updated', actor: actor(req), details: { key: req.params.key, value } });
  res.json({ settings: (await getAllSettings())[req.params.key] });
});

/** Who would get which reminder if the daily check ran today. Nothing is sent. */
r.get('/reminders/preview', async (_req, res) => {
  const source = await activeSource();
  if (!source) return res.json({ today: todayIso(), items: [] });
  const plan = await reminderPlan(source.id);
  const { rows: templates } = await query('SELECT status_key FROM templates');
  const have = new Set(templates.map((t) => t.status_key));
  res.json({
    today: todayIso(),
    items: plan.map(({ contact: c, rule }) => ({
      row_number: c.row_number, name: c.name, unit: c.fields?.unit ?? null, whatsapp: c.whatsapp, email: c.email, status: c.status,
      due_date: c.due_date, days_overdue: rule.overdue, stage: rule.days, template: rule.template, template_exists: have.has(rule.template), key: contactKey(c),
    })),
  });
});

r.post('/reminders/run', async (req, res) => {
  const run = await requestRun({ trigger: 'manual', kind: 'reminders', admin: req.admin });
  res.status(202).json({ run });
});

r.post('/balance/preview', async (req, res) => {
  const { to } = parse(z.object({ to: z.string().min(3) }), req.body);
  const phone = normalizePhone(to);
  const mail = normalizeEmail(to);
  if (!phone && !mail) throw new HttpError(400, 'Enter a mobile number or email from the sheet');
  const result = await balanceReplyText(mail ? 'email' : 'whatsapp', mail || phone);
  res.json({ text: result.text, error: result.error ?? null, rows: result.contacts.map((c) => c.row_number) });
});

function consentFilter(q) {
  return q.status && ['pending', 'accepted', 'declined'].includes(q.status) ? { sql: 'WHERE status = $1', params: [q.status] } : { sql: '', params: [] };
}

r.get('/consents', async (req, res) => {
  const f = consentFilter(req.query);
  const { rows } = await query(`SELECT * FROM consents ${f.sql} ORDER BY created_at DESC LIMIT 1000`, f.params);
  res.json({ consents: rows });
});

r.get('/consents/export.csv', async (req, res) => {
  const f = consentFilter(req.query);
  const { rows } = await query(`SELECT * FROM consents ${f.sql} ORDER BY created_at`, f.params);
  const cols = ['channel', 'address', 'profile_name', 'status', 'notice_sent_at', 'responded_at', 'response_text'];
  const body = rows.map((x) => cols.map((c) => csvCell(x[c] instanceof Date ? x[c].toISOString() : x[c])).join(','));
  res.type('text/csv').attachment('privacy-consents.csv').send([cols.join(','), ...body].join('\n'));
});

export default r;
