import './env.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { claimRun, executeRun } from '../src/services/runner.js';
import { promoteDueSchedules } from '../src/services/schedules.js';
import { verifyChain } from '../src/services/audit.js';

let agent;
const H = { 'X-Requested-With': 'notify' };

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  agent = request.agent(createApp());
});
after(() => pool.end());

const CSV = [
  'Name,WhatsApp,Email,Status,Amount,Due Date',
  'Ana Cruz,0917 111 2222,ana@example.com,Overdue,1500,2026-10-30',
  'Ben Reyes,0917 000 0000,,Overdue,200,2026-10-30', // mock WhatsApp fails numbers ending 0000
  'Carla Santos,,carla.fail@example.com,Reminder,99.5,2026-11-01', // mock email fails addresses containing "fail"
  'Dino Lim,,dino@example.com,Unknown Status,10,2026-11-01', // no template
  'Eve Tan,,,Reminder,5,2026-11-01', // no channel
  'Fe Ong,0917 333 4444,fe@example.com,Reminder,,2026-11-01', // amount missing -> template var missing
].join('\n');

test('rejects unauthenticated and cross-site requests', async () => {
  await request(createApp()).get('/api/dashboard').expect(401);
  await agent.post('/api/auth/login').send({ email: 'admin@test.local', password: 'x' }).expect(403); // no X-Requested-With
  await agent.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'wrong' }).expect(401);
  await agent.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'correct-horse-battery' }).expect(200);
});

test('upload CSV, templates, send now: WhatsApp first then email, failures consolidated', async () => {
  const up = await agent.post('/api/sources/upload').set(H).attach('file', Buffer.from(CSV), 'contacts.csv').expect(201);
  assert.equal(up.body.summary.rows, 6);
  assert.deepEqual(up.body.summary.statuses, ['overdue', 'reminder', 'unknown status']);

  await agent.post('/api/templates').set(H).send({
    status_key: 'Overdue', wa_body: 'Hi {{name}}, your balance of {{amount}} is overdue (due {{due_date}}).',
    email_subject: 'Overdue: {{amount}}', email_body: 'Dear {{name}},\nPlease pay {{amount}} by {{due_date}}.',
  }).expect(201);
  await agent.post('/api/templates').set(H).send({
    status_key: 'reminder', wa_template_name: 'payment_reminder', wa_language: 'en_US', wa_params: ['name', 'amount'],
    wa_body: 'Hello {{name}}, reminder: {{amount}}', email_subject: 'Reminder', email_body: 'Hi {{first_name}}, you have {{amount}} due.',
  }).expect(201);

  const stat = await agent.get('/api/sources/statuses').expect(200);
  assert.equal(stat.body.statuses.find((s) => s.status === 'unknown status').template_id, null);

  const { body: { run } } = await agent.post('/api/runs').set(H).send({}).expect(202);
  await agent.post('/api/runs').set(H).send({}).expect(409); // one run at a time

  const claimed = await claimRun();
  assert.equal(claimed.id, run.id);
  const done = await executeRun(claimed);
  assert.equal(done.status, 'completed_with_failures');

  const { body } = await agent.get(`/api/runs/${run.id}`).expect(200);
  const by = (name, ch) => body.recipients.find((r) => r.contact_name === name && r.channel === ch);
  assert.equal(by('Ana Cruz', 'whatsapp').state, 'sent');
  assert.equal(by('Ana Cruz', 'whatsapp').rendered_body, 'Hi Ana Cruz, your balance of 1500 is overdue (due 2026-10-30).');
  assert.equal(by('Ana Cruz', 'email').state, 'sent');
  assert.equal(by('Ben Reyes', 'whatsapp').state, 'failed');
  assert.equal(by('Carla Santos', 'email').state, 'failed');
  assert.match(by('Dino Lim', 'email').last_error, /No template/);
  assert.match(by('Eve Tan', 'none').last_error, /No valid mobile number or email/);
  assert.match(by('Fe Ong', 'whatsapp').last_error, /Missing value.*amount/);
  assert.equal(done.sent, 2);
  assert.equal(done.failed, 6);
  assert.equal(done.failure_report.length, 6);
  assert.ok(done.admin_notified_at, 'admin was notified once at the end');

  // WhatsApp sends happen before email sends
  const { rows: order } = await query("SELECT channel FROM audit_log WHERE run_id = $1 AND event = 'message_sent' ORDER BY id", [run.id]);
  assert.deepEqual(order.map((o) => o.channel), ['whatsapp', 'email']);
  // Every failure is in the audit log; the admin report is sent after the last send
  const { rows: ev } = await query('SELECT event FROM audit_log WHERE run_id = $1 ORDER BY id', [run.id]);
  const events = ev.map((e) => e.event);
  assert.equal(events.filter((e) => e === 'send_failed').length, 6);
  assert.ok(events.indexOf('admin_notified') > events.lastIndexOf('message_sent'));
  assert.equal(events.filter((e) => e === 'admin_notified').length, 1);

  const csv = await agent.get(`/api/runs/${run.id}/failures.csv`).expect(200);
  assert.match(csv.text, /Ben Reyes/);
});

test('audit log is immutable and hash-chain verifies', async () => {
  await assert.rejects(query("UPDATE audit_log SET status = 'x' WHERE id = 1"), /append-only/);
  await assert.rejects(query('DELETE FROM audit_log WHERE id = 1'), /append-only/);
  await assert.rejects(query('TRUNCATE audit_log'), /append-only/);
  const v = await verifyChain();
  assert.equal(v.ok, true);
  assert.ok(v.checked > 10);
  const res = await agent.get('/api/audit?event=send_failed').expect(200);
  assert.ok(res.body.total >= 6);
  const exp = await agent.get('/api/audit/export.csv').expect(200);
  assert.match(exp.text, /^id,ts,event/);
});

test('tampering is detected by verifyChain', async () => {
  // Simulate someone with superuser access bypassing the trigger
  await query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update');
  await query("UPDATE audit_log SET error = 'edited' WHERE id = (SELECT min(id) FROM audit_log WHERE event = 'send_failed')");
  await query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update');
  const v = await verifyChain();
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'content hash mismatch');
});

test('WhatsApp webhook: reply stored, statuses logged, admin can answer from inbox', async () => {
  const { rows: [sent] } = await query("SELECT * FROM run_recipients WHERE channel = 'whatsapp' AND state = 'sent' LIMIT 1");
  const payload = { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: sent.address, profile: { name: 'Ana' } }],
    messages: [{ from: sent.address, id: 'wamid.in.1', type: 'text', text: { body: 'I already paid' }, context: { id: sent.provider_message_id } }],
    statuses: [{ id: sent.provider_message_id, status: 'delivered', recipient_id: sent.address, timestamp: '1700000000' }],
  } }] }] };
  await agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').send(JSON.stringify(payload)).expect(200);
  await agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').send(JSON.stringify(payload)).expect(200); // retry is deduped

  const inbox = await agent.get('/api/inbox').expect(200);
  assert.equal(inbox.body.conversations.length, 1);
  assert.equal(inbox.body.conversations[0].unread, 1);
  assert.equal(inbox.body.conversations[0].contact_name, 'Ana Cruz');

  const thread = await agent.get('/api/inbox/thread').query({ channel: 'whatsapp', address: sent.address }).expect(200);
  assert.equal(thread.body.messages[0].body, 'I already paid');
  assert.equal(thread.body.messages[0].run_recipient_id, sent.id);

  await agent.post('/api/inbox/reply').set(H).send({ channel: 'whatsapp', address: sent.address, body: 'Thanks, noted!' }).expect(201);
  await agent.post('/api/inbox/reply').set(H).send({ channel: 'email', address: 'nobody@example.com', body: 'x' }).expect(400);
  const { rows } = await query("SELECT event FROM audit_log WHERE event IN ('reply_received','reply_sent','delivery_status')");
  assert.deepEqual(rows.map((r) => r.event).sort(), ['delivery_status', 'delivery_status', 'reply_received', 'reply_sent']);
});

test('webhook signature is enforced when app secret is set', async () => {
  const { config } = await import('../src/config.js');
  config.whatsapp.appSecret = 'shh';
  const body = JSON.stringify({ entry: [] });
  await agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').send(body).expect(401);
  const sig = 'sha256=' + crypto.createHmac('sha256', 'shh').update(body).digest('hex');
  await agent.post('/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sig).send(body).expect(200);
  config.whatsapp.appSecret = '';
});

test('schedules: create, fire when due, cancel', async () => {
  const soon = new Date(Date.now() + 3600_000).toISOString();
  const a = await agent.post('/api/schedules').set(H).send({ name: 'Monthly', run_at: soon }).expect(201);
  const b = await agent.post('/api/schedules').set(H).send({ name: 'Weekly', cron: '0 9 * * 1', timezone: 'Asia/Kuala_Lumpur' }).expect(201);
  assert.equal(new Date(b.body.schedule.next_run_at).getUTCHours(), 1); // 09:00 Kuala Lumpur = 01:00 UTC
  await agent.post('/api/schedules').set(H).send({ name: 'Past', run_at: '2020-01-01T00:00:00Z' }).expect(400);

  await agent.post(`/api/schedules/${b.body.schedule.id}/cancel`).set(H).expect(200);
  await agent.post(`/api/schedules/${b.body.schedule.id}/cancel`).set(H).expect(404);

  // make the one-time schedule due and let the worker promote it
  await query("UPDATE schedules SET next_run_at = now() - interval '1 second' WHERE id = $1", [a.body.schedule.id]);
  assert.equal(await promoteDueSchedules(), 1);
  const { rows: [s] } = await query('SELECT * FROM schedules WHERE id = $1', [a.body.schedule.id]);
  assert.equal(s.status, 'completed');
  const run = await claimRun();
  assert.equal(run.trigger, 'schedule');
  // cancel while running: pending recipients are skipped
  await query('UPDATE runs SET cancel_requested = TRUE WHERE id = $1', [run.id]);
  const done = await executeRun(run);
  assert.equal(done.status, 'cancelled');
});

test('cancel a queued run', async () => {
  const { body: { run } } = await agent.post('/api/runs').set(H).send({}).expect(202);
  const c = await agent.post(`/api/runs/${run.id}/cancel`).set(H).expect(200);
  assert.equal(c.body.run.status, 'cancelled');
  assert.equal(await claimRun(), null);
});

test('crashed run resumes without re-sending in-flight messages', async () => {
  const { body: { run } } = await agent.post('/api/runs').set(H).send({}).expect(202);
  const claimed = await claimRun();
  // Simulate: recipients were built, one was mid-send when the worker died
  await executeRun(claimed);
  const { rows: [r] } = await query("SELECT * FROM run_recipients WHERE run_id = $1 AND state = 'sent' LIMIT 1", [run.id]);
  await query("UPDATE run_recipients SET state = 'sending' WHERE id = $1", [r.id]);
  await query("UPDATE runs SET status = 'running', heartbeat_at = now() - interval '1 hour' WHERE id = $1", [run.id]);
  const again = await claimRun();
  assert.equal(again.id, run.id);
  await executeRun(again);
  const { rows: [after] } = await query('SELECT state, last_error FROM run_recipients WHERE id = $1', [r.id]);
  assert.equal(after.state, 'failed');
  assert.match(after.last_error, /Interrupted/);
});

test('dashboard summary', async () => {
  const { body } = await agent.get('/api/dashboard').expect(200);
  assert.equal(body.contacts.total, 6);
  assert.deepEqual(body.missingTemplates, ['unknown status']);
  assert.ok(body.runs.length >= 3);
});
