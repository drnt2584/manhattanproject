import { pool, query, tx } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import { syncSource } from './sources.js';
import { whatsapp } from '../providers/whatsapp.js';
import { email } from '../providers/email.js';
import { contactVariables, render } from '../lib/template.js';
import { mapPool, sleep } from '../lib/concurrency.js';
import { HttpError, SendError } from '../lib/errors.js';

const CHANNEL_ORDER = ['whatsapp', 'email']; // WhatsApp list first, then email list

/** Queue a run. Rejects if another run is already queued or in progress. */
export async function requestRun({ trigger, scheduleId = null, admin = null }, client = null) {
  const exec = async (c) => {
    const busy = await c.query("SELECT id FROM runs WHERE status IN ('queued','running') LIMIT 1");
    if (busy.rowCount) {
      if (trigger === 'manual') throw new HttpError(409, `Run #${busy.rows[0].id} is already queued or sending. Wait for it to finish or cancel it.`);
    }
    const src = await c.query('SELECT id FROM data_sources WHERE is_active LIMIT 1');
    if (!src.rowCount && trigger === 'manual') throw new HttpError(400, 'Upload a file or connect a Google Sheet first');
    const { rows: [run] } = await c.query(
      'INSERT INTO runs (trigger, schedule_id, source_id, requested_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [trigger, scheduleId, src.rows[0]?.id ?? null, admin?.id ?? null],
    );
    await audit({
      event: 'run_requested', actor: admin ? `admin:${admin.email}` : 'scheduler', run_id: run.id,
      details: { trigger, schedule_id: scheduleId, source_id: run.source_id },
    }, c);
    return run;
  };
  return client ? exec(client) : tx(exec);
}

/** Build the recipient list for a run: one row per (contact, channel), with content rendered up-front. */
async function buildRecipients(run) {
  const { rows: contacts } = await query('SELECT * FROM contacts WHERE source_id = $1 ORDER BY row_number', [run.source_id]);
  const { rows: templates } = await query('SELECT * FROM templates');
  const byStatus = new Map(templates.map((t) => [t.status_key, t]));
  const out = [];

  for (const c of contacts) {
    const base = { contact_id: c.id, row_number: c.row_number, contact_name: c.name, status_key: c.status };
    const channels = [];
    if (c.whatsapp) channels.push(['whatsapp', c.whatsapp]);
    if (c.email) channels.push(['email', c.email]);
    if (!channels.length) {
      out.push({ ...base, channel: 'none', address: null, state: 'failed', last_error: `No valid WhatsApp number or email (${c.warnings.join('; ') || 'empty'})` });
      continue;
    }
    const tpl = byStatus.get(c.status) ?? byStatus.get('*');
    const vars = contactVariables(c);
    for (const [channel, address] of channels) {
      const r = { ...base, channel, address, template_id: tpl?.id ?? null };
      if (!tpl) {
        out.push({ ...r, state: 'failed', last_error: `No template for status "${c.status ?? '(blank)'}"` });
        continue;
      }
      if (channel === 'whatsapp') {
        if (!tpl.wa_enabled) { out.push({ ...r, state: 'skipped', last_error: 'WhatsApp disabled for this status template' }); continue; }
        const body = render(tpl.wa_body, vars);
        const missing = new Set(body.missing);
        let payload;
        if (tpl.wa_template_name) {
          const params = (tpl.wa_params || []).map((k) => {
            const v = vars[String(k).toLowerCase()];
            if (v === undefined || v === '') missing.add(String(k).toLowerCase());
            return v ?? '';
          });
          payload = { template: { name: tpl.wa_template_name, language: tpl.wa_language, params } };
        } else {
          payload = { text: body.text };
        }
        if (missing.size) { out.push({ ...r, state: 'failed', last_error: `Missing value(s) in sheet for: ${[...missing].join(', ')}` }); continue; }
        out.push({ ...r, state: 'pending', rendered_body: body.text, wa_payload: payload });
      } else {
        if (!tpl.email_enabled) { out.push({ ...r, state: 'skipped', last_error: 'Email disabled for this status template' }); continue; }
        const subject = render(tpl.email_subject, vars);
        const body = render(tpl.email_body, vars);
        const missing = [...new Set([...subject.missing, ...body.missing])];
        if (missing.length) { out.push({ ...r, state: 'failed', last_error: `Missing value(s) in sheet for: ${missing.join(', ')}` }); continue; }
        out.push({ ...r, state: 'pending', rendered_subject: subject.text, rendered_body: body.text });
      }
    }
  }

  await tx(async (client) => {
    for (let i = 0; i < out.length; i += 300) {
      const part = out.slice(i, i + 300);
      const cols = ['run_id', 'contact_id', 'row_number', 'contact_name', 'channel', 'address', 'status_key', 'template_id',
        'rendered_subject', 'rendered_body', 'wa_payload', 'state', 'last_error'];
      const params = [];
      const values = part.map((r, j) => {
        params.push(run.id, r.contact_id, r.row_number, r.contact_name, r.channel, r.address, r.status_key, r.template_id ?? null,
          r.rendered_subject ?? null, r.rendered_body ?? null, r.wa_payload ? JSON.stringify(r.wa_payload) : null, r.state, r.last_error ?? null);
        return '(' + cols.map((_, k) => `$${j * cols.length + k + 1}`).join(',') + ')';
      });
      await client.query(`INSERT INTO run_recipients (${cols.join(',')}) VALUES ${values.join(',')}`, params);
    }
    await client.query('UPDATE runs SET total = $2 WHERE id = $1', [run.id, out.length]);
  });

  // Recipients that can't be sent are still part of the audit trail.
  for (const r of out.filter((x) => x.state !== 'pending')) {
    await audit({
      event: r.state === 'failed' ? 'send_failed' : 'send_skipped', run_id: run.id, channel: r.channel, direction: 'outbound',
      contact_name: r.contact_name, address: r.address, status: r.state, error: r.last_error,
      details: { stage: 'prepare', row_number: r.row_number, status_key: r.status_key },
    });
  }
  return out.length;
}

function cancelChecker(runId) {
  let last = 0;
  let cancelled = false;
  return async () => {
    if (cancelled) return true;
    if (Date.now() - last < 2000) return false;
    last = Date.now();
    const { rows } = await query('SELECT cancel_requested FROM runs WHERE id = $1', [runId]);
    cancelled = !!rows[0]?.cancel_requested;
    return cancelled;
  };
}

async function deliver(run, r) {
  await query("UPDATE run_recipients SET state = 'sending' WHERE id = $1", [r.id]);
  const { maxAttempts, retryBaseMs } = config.worker;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = r.channel === 'whatsapp'
        ? await whatsapp.send(r.address, r.wa_payload)
        : await email.send({ to: r.address, subject: r.rendered_subject, text: r.rendered_body });
      await query(
        "UPDATE run_recipients SET state = 'sent', attempts = $2, provider_message_id = $3, sent_at = now(), last_error = NULL WHERE id = $1",
        [r.id, attempt, res.id],
      );
      await audit({
        event: 'message_sent', run_id: run.id, channel: r.channel, direction: 'outbound', contact_name: r.contact_name,
        address: r.address, status: 'sent', provider_message_id: res.id,
        details: { attempt, row_number: r.row_number, status_key: r.status_key, template_id: r.template_id, subject: r.rendered_subject, body: r.rendered_body, wa_payload: r.wa_payload },
      });
      return;
    } catch (err) {
      const transient = err instanceof SendError ? err.transient : false;
      const final = !transient || attempt === maxAttempts;
      await audit({
        event: 'send_failed', run_id: run.id, channel: r.channel, direction: 'outbound', contact_name: r.contact_name,
        address: r.address, status: final ? 'failed' : 'retrying', error: err.message,
        details: { attempt, transient, code: err.code ?? null, row_number: r.row_number, status_key: r.status_key },
      });
      if (final) {
        await query("UPDATE run_recipients SET state = 'failed', attempts = $2, last_error = $3 WHERE id = $1", [r.id, attempt, err.message]);
        if (!(err instanceof SendError)) logger.error({ err, recipient: r.id }, 'unexpected send error');
        return;
      }
      await sleep(retryBaseMs * 4 ** (attempt - 1));
    }
  }
}

async function notifyAdmin(run, subject, text) {
  if (!config.adminNotifyEmails.length) {
    logger.warn({ runId: run.id }, 'ADMIN_NOTIFY_EMAILS not set; failure report only visible in dashboard');
    return false;
  }
  for (const to of config.adminNotifyEmails) {
    try {
      const res = await email.send({ to, subject, text });
      await audit({ event: 'admin_notified', run_id: run.id, channel: 'email', address: to, status: 'sent', provider_message_id: res.id, details: { subject } });
    } catch (err) {
      await audit({ event: 'admin_notify_failed', run_id: run.id, channel: 'email', address: to, status: 'failed', error: err.message });
    }
  }
  return true;
}

function failureReportText(run, failures) {
  const lines = [
    `Run #${run.id} finished with ${failures.length} failed delivery(ies).`,
    `Sent: ${run.sent}   Failed: ${run.failed}   Skipped: ${run.skipped}   Total: ${run.total}`,
    '',
    'Affected contacts:',
    ...failures.map((f, i) => `${i + 1}. ${f.contact_name || '(no name)'} [row ${f.row_number ?? '?'}] — ${f.channel} ${f.address || ''}\n   Reason: ${f.error}`),
    '',
    `Details: ${config.publicUrl}/runs/${run.id}`,
  ];
  return lines.join('\n');
}

async function finalize(run, cancelled) {
  if (cancelled) {
    await query("UPDATE run_recipients SET state = 'skipped', last_error = 'Run cancelled before sending' WHERE run_id = $1 AND state = 'pending'", [run.id]);
  }
  const { rows: [counts] } = await query(
    `SELECT count(*) FILTER (WHERE state = 'sent') AS sent, count(*) FILTER (WHERE state = 'failed') AS failed,
            count(*) FILTER (WHERE state = 'skipped') AS skipped, count(*) AS total
       FROM run_recipients WHERE run_id = $1`, [run.id]);
  const { rows: failures } = await query(
    `SELECT contact_name, row_number, channel, address, last_error AS error FROM run_recipients
      WHERE run_id = $1 AND state = 'failed' ORDER BY row_number, channel`, [run.id]);
  const status = cancelled ? 'cancelled' : failures.length ? 'completed_with_failures' : 'completed';
  const { rows: [done] } = await query(
    `UPDATE runs SET status = $2, sent = $3, failed = $4, skipped = $5, total = $6, failure_report = $7, finished_at = now()
      WHERE id = $1 RETURNING *`,
    [run.id, status, counts.sent, counts.failed, counts.skipped, counts.total, JSON.stringify(failures)],
  );
  await audit({ event: 'run_completed', run_id: run.id, status, details: { sent: done.sent, failed: done.failed, skipped: done.skipped, total: done.total } });

  // One consolidated notification after the whole list has been processed.
  if (failures.length) {
    const notified = await notifyAdmin(done, `[Notify] Run #${run.id}: ${failures.length} failed send(s)`, failureReportText(done, failures));
    if (notified) return (await query('UPDATE runs SET admin_notified_at = now() WHERE id = $1 RETURNING *', [run.id])).rows[0];
  }
  return done;
}

/** Execute (or resume) a claimed run. */
export async function executeRun(run) {
  const log = logger.child({ runId: run.id });
  const heartbeat = setInterval(() => {
    query('UPDATE runs SET heartbeat_at = now() WHERE id = $1', [run.id]).catch(() => {});
  }, 15_000);
  try {
    const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM run_recipients WHERE run_id = $1', [run.id]);
    if (n === 0) {
      await audit({ event: 'run_started', run_id: run.id, details: { trigger: run.trigger, source_id: run.source_id } });
      if (!run.source_id) throw new Error('No active data source (upload a file or connect a Google Sheet)');
      // Pull the latest values from Google Sheets right before sending.
      await syncSource(run.source_id, { runId: run.id });
      const total = await buildRecipients(run);
      log.info({ total }, 'recipients prepared');
    } else {
      // Worker crashed mid-run. Anything that was mid-send has an unknown outcome:
      // record it as failed instead of risking a duplicate message.
      const { rows: interrupted } = await query(
        `UPDATE run_recipients SET state = 'failed', last_error = 'Interrupted while sending (worker restart); not retried to avoid duplicates'
          WHERE run_id = $1 AND state = 'sending' RETURNING *`, [run.id]);
      for (const r of interrupted) {
        await audit({ event: 'send_failed', run_id: run.id, channel: r.channel, direction: 'outbound', contact_name: r.contact_name, address: r.address, status: 'failed', error: r.last_error, details: { stage: 'resume' } });
      }
      await audit({ event: 'run_resumed', run_id: run.id, details: { interrupted: interrupted.length } });
    }

    const isCancelled = cancelChecker(run.id);
    for (const channel of CHANNEL_ORDER) {
      const { rows: pending } = await query(
        "SELECT * FROM run_recipients WHERE run_id = $1 AND channel = $2 AND state = 'pending' ORDER BY row_number, id", [run.id, channel]);
      if (!pending.length) continue;
      log.info({ channel, count: pending.length }, 'sending');
      const limit = channel === 'whatsapp' ? config.whatsapp.concurrency : config.email.concurrency;
      await mapPool(pending, limit, (r) => deliver(run, r), isCancelled);
      await audit({ event: 'channel_completed', run_id: run.id, channel, details: { attempted: pending.length } });
    }
    const done = await finalize(run, await isCancelled());
    log.info({ status: done.status, sent: done.sent, failed: done.failed }, 'run finished');
    return done;
  } catch (err) {
    log.error({ err }, 'run failed');
    const { rows: [failed] } = await query(
      "UPDATE runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1 RETURNING *", [run.id, err.message]);
    await audit({ event: 'run_failed', run_id: run.id, status: 'failed', error: err.message });
    const notified = await notifyAdmin(failed, `[Notify] Run #${run.id} failed`, `Run #${run.id} could not be completed.\n\nReason: ${err.message}\n\n${config.publicUrl}/runs/${run.id}`);
    if (notified) return (await query('UPDATE runs SET admin_notified_at = now() WHERE id = $1 RETURNING *', [run.id])).rows[0];
    return failed;
  } finally {
    clearInterval(heartbeat);
  }
}

/** Atomically claim the next queued run (or a run whose worker died). */
export async function claimRun() {
  const { rows } = await pool.query(
    `UPDATE runs SET status = 'running', started_at = COALESCE(started_at, now()), heartbeat_at = now()
      WHERE id = (
        SELECT id FROM runs
         WHERE status = 'queued'
            OR (status = 'running' AND heartbeat_at < now() - make_interval(secs => $1::double precision / 1000))
         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`, [config.worker.staleRunMs]);
  return rows[0] ?? null;
}
