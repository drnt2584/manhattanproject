import './env.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { claimRun, executeRun, requestRun } from '../src/services/runner.js';
import { maybeQueueDailyReminders, pickStage, contactKey } from '../src/services/reminders.js';
import { handleWhatsappWebhook } from '../src/services/inbound.js';
import { runAutomations, classifyConsent, isBalanceQuestion } from '../src/services/automations.js';
import { DEFAULTS } from '../src/services/settings.js';
import { verifyChain } from '../src/services/audit.js';
import { parseDate, todayIso } from '../src/lib/dates.js';
import { contactVariables } from '../src/lib/template.js';

const H = { 'X-Requested-With': 'notify' };
let agent;

const shift = (days) => {
  const d = new Date(todayIso() + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const us = (iso) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`; // MM/DD/YYYY like Google Sheets

function sheet(rows) {
  return ['Name,Unit,WhatsApp,Email,Status,Billing Period,Amount,Previous Unpaid,Due Date', ...rows].join('\n');
}
const ROWS = () => [
  `Ana Cruz,12A,0917 111 2222,ana@example.com,Unpaid,Q4 2026,"12,450.00",0,${us(shift(-6))}`,
  `Ben Reyes,8C,0917 222 3333,ben@example.com,Unpaid,Q4 2026,"9,800.00","9,800.00",${us(shift(-20))}`,
  `Carla Santos,15B,0918 333 4444,,Paid,Q4 2026,"12,450.00",0,${us(shift(-40))}`,
  `Dino Lim,3F,,dino@example.com,Unpaid,Q4 2026,"7,200.00",,${us(shift(10))}`,
  `Eve Tan,20D,0918 555 6666,,Unpaid,Q4 2026,"5,000.00","1,000",${us(shift(-31))}`,
];

async function upload(csv) {
  return agent.post('/api/sources/upload').set(H).attach('file', Buffer.from(csv), 'dues.csv').expect(201);
}
async function runQueued() {
  const run = await claimRun();
  return executeRun(run);
}
const wa = (from, id, body, name = 'WA User') => ({ entry: [{ changes: [{ value: {
  contacts: [{ wa_id: from, profile: { name } }], messages: [{ from, id, type: 'text', text: { body } }],
} }] }] });
async function inbound(from, id, body, name) {
  await runAutomations(await handleWhatsappWebhook(wa(from, id, body, name)));
  const { rows } = await query("SELECT body FROM messages WHERE address = $1 AND direction = 'outbound' AND auto ORDER BY id DESC LIMIT 1", [from]);
  return rows[0]?.body ?? null;
}

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  agent = request.agent(createApp());
  await agent.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'correct-horse-battery' }).expect(200);
  await seed(JSON.parse(await fs.readFile(new URL('../seeds/manhattan-residence.json', import.meta.url), 'utf8')));
});
after(() => pool.end());

test('date parsing and dues variables', () => {
  assert.equal(parseDate('10/30/2026'), '2026-10-30');
  assert.equal(parseDate('30/10/2026'), '2026-10-30');
  assert.equal(parseDate('03/04/2026', 'DMY'), '2026-04-03');
  assert.equal(parseDate('Oct 30, 2026'), '2026-10-30');
  assert.equal(parseDate('46325'), '2026-10-30');
  assert.equal(parseDate('2026-02-30'), null);
  const v = contactVariables({ name: 'Ben Reyes', amount: 9800, due_date: '2026-10-01', fields: { previous_unpaid: '9,800.00', unit: '8C' } }, '2026-10-21');
  assert.equal(v.total_due, '19600');
  assert.equal(v.total_due_formatted, '19,600.00');
  assert.equal(v.days_overdue, '20');
  assert.equal(v.due_status, 'overdue by 20 days');
  assert.equal(v.due_date_formatted, 'October 1, 2026');
  const early = contactVariables({ name: 'X', amount: 1, due_date: '2026-10-01', fields: { previous_unpaid: '' } }, '2026-09-30');
  assert.equal(early.previous_unpaid_formatted, '0.00');
  assert.equal(early.due_status, 'due in 1 day');
});

test('reminder stage selection', () => {
  const cfg = DEFAULTS.reminders;
  const c = (status, due) => ({ status, due_date: due, whatsapp: '639171112222', name: 'A', fields: { unit: '1A' } });
  const today = '2026-11-01';
  assert.equal(pickStage(c('unpaid', '2026-10-30'), cfg, new Set(), today), null); // +2 days
  assert.equal(pickStage(c('unpaid', '2026-10-27'), cfg, new Set(), today).days, 5);
  assert.equal(pickStage(c('unpaid', '2026-10-18'), cfg, new Set(), today).days, 14);
  assert.equal(pickStage(c('unpaid', '2026-10-01'), cfg, new Set(), today).days, 30);
  assert.equal(pickStage(c('paid', '2026-10-01'), cfg, new Set(), today), null);
  const sent = new Set([`${contactKey(c('unpaid', '2026-10-18'))}|2026-10-18|14`]);
  assert.equal(pickStage(c('unpaid', '2026-10-18'), cfg, sent, today), null); // already sent this stage
});

test('consent and balance keyword detection', () => {
  const p = DEFAULTS.privacy;
  assert.equal(classifyConsent('YES!', p), 'yes');
  assert.equal(classifyConsent('Oo po', p), 'yes');
  assert.equal(classifyConsent('yes i agree', p), 'yes');
  assert.equal(classifyConsent('No, I do not agree', p), 'no');
  assert.equal(classifyConsent('hindi', p), 'no');
  assert.equal(classifyConsent('what is this?', p), null);
  const k = DEFAULTS.balance.keywords;
  assert.ok(isBalanceQuestion('Hi, how much is my balance?', k));
  assert.ok(isBalanceQuestion('magkano po dues ko', k));
  assert.ok(!isBalanceQuestion('The elevator is broken', k));
  assert.ok(!isBalanceQuestion('billion', ['bill']));
});

test('1. quarterly bill notice: unpaid get the notice with totals, paid are skipped', async () => {
  await upload(sheet(ROWS()));
  const { body: { run } } = await agent.post('/api/runs').set(H).send({}).expect(202);
  const done = await runQueued();
  assert.equal(done.id, run.id);
  const { rows } = await query('SELECT contact_name, channel, state, rendered_body, rendered_subject, wa_payload FROM run_recipients WHERE run_id = $1', [run.id]);
  const ben = rows.find((r) => r.contact_name === 'Ben Reyes' && r.channel === 'whatsapp');
  assert.equal(ben.state, 'sent');
  assert.match(ben.rendered_body, /Unit 8C covering Q4 2026/);
  assert.match(ben.rendered_body, /Previous unpaid balance: 9,800\.00\nTotal amount due: 19,600\.00/);
  assert.equal(ben.wa_payload.template.name, 'tmr_quarterly_dues_notice');
  assert.deepEqual(ben.wa_payload.template.params.slice(0, 3), ['Ben Reyes', '8C', 'Q4 2026']);
  const dino = rows.find((r) => r.contact_name === 'Dino Lim');
  assert.match(dino.rendered_body, /Previous unpaid balance:\s+0\.00/); // blank cell = nothing owed
  assert.equal(dino.rendered_subject, 'Association Dues Notice – Unit 3F – Q4 2026');
  assert.ok(rows.filter((r) => r.contact_name === 'Carla Santos').every((r) => r.state === 'skipped'));
  assert.equal(done.failed, 0);
});

test('2. overdue reminders: right stage per account, each stage only once, paid accounts never', async () => {
  const preview = await agent.get('/api/automations/reminders/preview').expect(200);
  const stages = Object.fromEntries(preview.body.items.map((i) => [i.name, i.stage]));
  assert.deepEqual(stages, { 'Ana Cruz': 5, 'Ben Reyes': 14, 'Eve Tan': 30 });

  await requestRun({ trigger: 'automation', kind: 'reminders' });
  const done = await runQueued();
  assert.equal(done.kind, 'reminders');
  const { rows } = await query('SELECT contact_name, channel, status_key, state, rendered_body FROM run_recipients WHERE run_id = $1 ORDER BY row_number, channel', [done.id]);
  assert.deepEqual(rows.map((r) => `${r.contact_name}/${r.channel}/${r.status_key}/${r.state}`), [
    'Ana Cruz/email/reminder_5/sent', 'Ana Cruz/whatsapp/reminder_5/sent',
    'Ben Reyes/email/reminder_14/sent', 'Ben Reyes/whatsapp/reminder_14/sent',
    'Eve Tan/whatsapp/final_30/sent',
  ]);
  assert.match(rows.find((r) => r.contact_name === 'Eve Tan').rendered_body, /^FINAL NOTICE: .*now 31 days past/s);
  assert.match(rows.find((r) => r.contact_name === 'Eve Tan').rendered_body, /Total amount due: 6,000\.00/);

  // Running again the same day sends nothing new
  await requestRun({ trigger: 'automation', kind: 'reminders' });
  assert.equal((await runQueued()).total, 0);

  // Ana pays (sheet updated) and Ben moves into the +30 window: only Ben gets the final notice
  const rows2 = ROWS().map((r) => (r.startsWith('Ana') ? r.replace('Unpaid', 'Paid') : r.startsWith('Ben') ? r.replace(us(shift(-20)), us(shift(-30))) : r));
  await upload(sheet(rows2));
  await requestRun({ trigger: 'automation', kind: 'reminders' });
  const third = await runQueued();
  const { rows: r3 } = await query('SELECT DISTINCT contact_name, status_key FROM run_recipients WHERE run_id = $1', [third.id]);
  assert.deepEqual(r3, [{ contact_name: 'Ben Reyes', status_key: 'final_30' }]);
});

test('daily reminder check queues exactly one run per day once enabled', async () => {
  await query("DELETE FROM settings WHERE key = 'reminders_last_run'");
  assert.equal(await maybeQueueDailyReminders(), null); // disabled by default
  const { body } = await agent.get('/api/automations').expect(200);
  await agent.put('/api/automations/reminders').set(H).send({ ...body.settings.reminders, enabled: true, time: '00:00' }).expect(200);
  const run = await maybeQueueDailyReminders();
  assert.equal(run.kind, 'reminders');
  assert.equal(run.trigger, 'automation');
  assert.equal(await maybeQueueDailyReminders(), null);
  await runQueued();
  await agent.put('/api/automations/reminders').set(H).send({ ...body.settings.reminders, time: '9am' }).expect(400);
});

test('3. data privacy notice for unknown senders, consent recorded', async () => {
  const { body } = await agent.get('/api/automations').expect(200);
  await agent.put('/api/automations/privacy').set(H).send({ ...body.settings.privacy, enabled: true }).expect(200);
  await agent.put('/api/automations/balance').set(H).send({ ...body.settings.balance, enabled: true }).expect(200);

  const stranger = '639991234567';
  assert.match(await inbound(stranger, 'wamid.s1', 'Hi, is there a unit for rent?', 'Rico'), /DATA PRIVACY NOTICE[\s\S]*Republic Act No\. 10173[\s\S]*reply YES or NO/);
  assert.match(await inbound(stranger, 'wamid.s2', 'what?'), /Please reply YES/);
  assert.match(await inbound(stranger, 'wamid.s3', 'Yes po'), /consent has been recorded/);
  // after answering, further messages just go to the inbox (no more notices)
  const before = (await query('SELECT count(*)::int n FROM messages WHERE auto')).rows[0].n;
  await inbound(stranger, 'wamid.s4', 'Thanks, I will visit tomorrow');
  assert.equal((await query('SELECT count(*)::int n FROM messages WHERE auto')).rows[0].n, before);

  await inbound('639990000001', 'wamid.d1', 'hello');
  assert.match(await inbound('639990000001', 'wamid.d2', 'NO'), /do not consent/);

  // known residents never get the notice
  assert.equal(await inbound('639171112222', 'wamid.k1', 'Good morning, the hallway light is out'), null);

  const consents = (await agent.get('/api/automations/consents').expect(200)).body.consents;
  assert.deepEqual(consents.map((c) => [c.address, c.status, c.profile_name]).sort(), [
    ['639990000001', 'declined', 'WA User'], [stranger, 'accepted', 'Rico'],
  ].sort());
  const csv = await agent.get('/api/automations/consents/export.csv?status=accepted').expect(200);
  assert.match(csv.text, /639991234567,Rico,accepted/);
});

test('4. balance inquiry replies with the latest sheet values and days overdue', async () => {
  const ben = await inbound('639172223333', 'wamid.b1', 'Hi, magkano po ang balance ko?');
  assert.match(ben, /Hello Ben, here is the latest statement for Unit 8C/);
  assert.match(ben, /Total amount due: 19,600\.00/);
  assert.match(ben, /\(overdue by 30 days\)/);
  assert.match(await inbound('639183334444', 'wamid.b2', 'how much is my bill?'), /no unpaid association dues/); // Carla, paid
  assert.match(await inbound('639991234567', 'wamid.b3', 'what is my balance'), /could not find a unit account/); // consented stranger
  const preview = await agent.post('/api/automations/balance/preview').set(H).send({ to: '0917 222 3333' }).expect(200);
  assert.match(preview.body.text, /19,600\.00/);
  const { rows } = await query("SELECT count(*)::int n FROM audit_log WHERE event IN ('balance_inquiry','auto_reply_sent','privacy_notice_sent','privacy_consent_accepted','privacy_consent_declined')");
  assert.ok(rows[0].n >= 10);
  assert.equal((await verifyChain()).ok, true);
});
