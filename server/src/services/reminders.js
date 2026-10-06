import { query, tx } from '../db.js';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import { getSetting, saveSetting } from './settings.js';
import { requestRun } from './runner.js';
import { todayIso, nowHm, daysBetween } from '../lib/dates.js';

/** Stable identity of one billed account (a person may own several units). */
export function contactKey(c) {
  const who = String(c.fields?.unit || c.name || `row-${c.row_number}`).trim().toLowerCase();
  return [c.whatsapp || '', c.email || '', who].join('|');
}

/**
 * Which reminder (if any) a contact should get today: the latest stage whose
 * day threshold has passed, unless that stage was already delivered for this
 * due date. Paid accounts (status not in unpaid_statuses) never get one.
 */
export function pickStage(contact, cfg, sent, today) {
  if (!contact.due_date || !cfg.unpaid_statuses.map((s) => s.toLowerCase()).includes(contact.status)) return null;
  const overdue = daysBetween(contact.due_date, today);
  const due = [...cfg.rules].filter((r) => overdue >= r.days).sort((a, b) => b.days - a.days)[0];
  if (!due) return null;
  if (sent.has(`${contactKey(contact)}|${contact.due_date}|${due.days}`)) return null;
  return { ...due, overdue };
}

/** Contacts of a source that are due a reminder today. */
export async function reminderPlan(sourceId, today = todayIso()) {
  const cfg = await getSetting('reminders');
  const { rows: contacts } = await query('SELECT * FROM contacts WHERE source_id = $1 AND due_date IS NOT NULL ORDER BY row_number', [sourceId]);
  const { rows: sentRows } = await query(
    'SELECT contact_key, due_date, rule_days FROM reminder_sends WHERE due_date = ANY($1::date[])',
    [[...new Set(contacts.map((c) => c.due_date))]]);
  const sent = new Set(sentRows.map((r) => `${r.contact_key}|${r.due_date}|${r.rule_days}`));
  return contacts.map((c) => ({ contact: c, rule: pickStage(c, cfg, sent, today) })).filter((x) => x.rule);
}

/** Called by the worker loop: queue today's reminder run once, after the configured time. */
export async function maybeQueueDailyReminders(now = new Date()) {
  const cfg = await getSetting('reminders');
  if (!cfg.enabled) return null;
  const today = todayIso(now);
  if (nowHm(now) < cfg.time) return null;
  return tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(727003)');
    const { rows } = await c.query("SELECT value FROM settings WHERE key = 'reminders_last_run'");
    if (rows[0]?.value?.date === today) return null;
    const run = await requestRun({ trigger: 'automation', kind: 'reminders' }, c);
    await saveSetting('reminders_last_run', { date: today, run_id: run.id }, null, c);
    logger.info({ runId: run.id }, 'daily reminder run queued');
    return run;
  });
}

export async function recordReminderSends(runId) {
  const { rowCount } = await query(
    `INSERT INTO reminder_sends (contact_key, due_date, rule_days, run_id)
     SELECT DISTINCT contact_key, due_date, reminder_days, run_id FROM run_recipients
      WHERE run_id = $1 AND state = 'sent' AND reminder_days IS NOT NULL
     ON CONFLICT DO NOTHING`, [runId]);
  if (rowCount) await audit({ event: 'reminders_recorded', run_id: runId, details: { stages: rowCount } });
  return rowCount;
}
