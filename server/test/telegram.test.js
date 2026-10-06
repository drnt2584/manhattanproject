import './env-telegram.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import request from 'supertest';
import { pool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { claimRun, executeRun } from '../src/services/runner.js';
import { handleTelegramUpdate } from '../src/services/telegramBot.js';
import { mockOutbox } from '../src/providers/telegram.js';
import { verifyChain } from '../src/services/audit.js';

const H = { 'X-Requested-With': 'notify' };
let agent;
let updateId = 1;
const last = () => mockOutbox.at(-1);

function tg(chatId, { text, contact, userId = chatId, first = 'User' } = {}) {
  const message = { message_id: updateId, chat: { id: chatId, type: 'private' }, from: { id: userId, first_name: first, username: `u${userId}` } };
  if (text !== undefined) message.text = text;
  if (contact) message.contact = contact;
  return handleTelegramUpdate({ update_id: updateId++, message });
}

const SHEET = [
  'Name,Unit,Mobile,Email,Status,Billing Period,Maintenance & Sinking Fund,Arrears,Due Date',
  'Aisyah Rahman,A-12-03,012-111 2222,aisyah@example.com,Unpaid,Q4 2026,"1,245.00",0,15/12/2026',
  'Benjamin Lee,B-08-01,012-222 3333,ben@example.com,Unpaid,Q4 2026,980.00,980.00,15/12/2026',
  'Chitra Devi,A-15-02,013-333 4444,,Paid,Q4 2026,"1,245.00",0,15/12/2026',
  'Daniel Wong,C-03-06,,daniel@example.com,Unpaid,Q4 2026,720.00,0,15/12/2026',
  'Farah Aziz,B-20-04,013-555 6666,,Unpaid,Q4 2026,500.00,100,15/12/2026',
  'Gopal Nair,D-01-01,013-777 0000,,Unpaid,Q4 2026,300.00,0,15/12/2026',
].join('\n');

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  agent = request.agent(createApp());
  await agent.post('/api/auth/login').set(H).send({ email: 'admin@test.local', password: 'correct-horse-battery' }).expect(200);
  await seed(JSON.parse(await fs.readFile(new URL('../seeds/manhattan-residence.json', import.meta.url), 'utf8')));
  await agent.post('/api/sources/upload').set(H).attach('file', Buffer.from(SHEET), 'dues.csv').expect(201);
});
after(() => pool.end());

test('residents link their Telegram chat by sharing their own number', async () => {
  await tg(111, { text: '/start' });
  assert.match(last().text, /Share my phone number/);
  assert.equal(last().extra.reply_markup.keyboard[0][0].request_contact, true);

  await tg(111, { text: 'hi, nak tanya baki' }); // before linking: asked to share number, message kept
  assert.match(last().text, /tap "Share my phone number" below first/);

  await tg(111, { contact: { phone_number: '60125550000', user_id: 999 } }); // someone else's contact card
  assert.match(last().text, /share your own number/);

  await tg(111, { contact: { phone_number: '60121112222', user_id: 111 }, first: 'Aisyah' });
  assert.match(last().text, /Thank you, Aisyah\. This chat is now linked to Unit A-12-03/);
  assert.equal(last().extra.reply_markup.remove_keyboard, true);
  const { rows } = await query("SELECT address FROM messages WHERE channel = 'telegram'");
  assert.deepEqual(rows.map((r) => r.address), ['60121112222']); // earlier message moved to her thread

  await tg(444, { contact: { phone_number: '+60137770000', user_id: 444 } }); // Gopal (mock: chat ids ending 0000 are "blocked" later)
  await query("UPDATE telegram_links SET chat_id = 7770000 WHERE phone = '60137770000'");
  const contacts = (await agent.get('/api/sources/contacts').expect(200)).body.contacts;
  assert.deepEqual(contacts.filter((c) => c.telegram_linked).map((c) => c.name), ['Aisyah Rahman', 'Gopal Nair']);
});

test('bill run uses Telegram first, then email; unlinked residents are reported', async () => {
  const { body: { run } } = await agent.post('/api/runs').set(H).send({}).expect(202);
  await executeRun(await claimRun());
  const { rows } = await query('SELECT contact_name, channel, state, last_error, wa_payload FROM run_recipients WHERE run_id = $1 ORDER BY row_number, channel', [run.id]);
  const s = Object.fromEntries(rows.map((r) => [`${r.contact_name}/${r.channel}`, r.state]));
  assert.deepEqual(s, {
    'Aisyah Rahman/email': 'sent', 'Aisyah Rahman/telegram': 'sent',
    'Benjamin Lee/email': 'sent', 'Benjamin Lee/telegram': 'skipped', // not joined, still gets email
    'Chitra Devi/telegram': 'skipped', // paid
    'Daniel Wong/email': 'sent',
    'Farah Aziz/telegram': 'failed', // not joined and no email
    'Gopal Nair/telegram': 'failed', // blocked the bot
  });
  assert.match(rows.find((r) => r.contact_name === 'Farah Aziz').last_error, /has not joined the Telegram bot and has no email/);
  assert.match(rows.find((r) => r.contact_name === 'Gopal Nair').last_error, /blocked/);
  assert.ok((await query("SELECT blocked_at FROM telegram_links WHERE phone = '60137770000'")).rows[0].blocked_at);
  const aisyah = mockOutbox.find((m) => m.chatId === '111' && /billing notice/.test(m.text));
  assert.match(aisyah.text, /Unit A-12-03[\s\S]*Total amount due: RM 1,245\.00[\s\S]*3214-1858-04/);
  const order = (await query("SELECT channel FROM audit_log WHERE run_id = $1 AND event = 'message_sent' ORDER BY id", [run.id])).rows.map((r) => r.channel);
  assert.deepEqual(order, ['telegram', 'email', 'email', 'email']);
  const done = (await query('SELECT failure_report FROM runs WHERE id = $1', [run.id])).rows[0];
  assert.equal(done.failure_report.length, 2);
});

test('balance questions and inbox replies work over Telegram', async () => {
  const { body } = await agent.get('/api/automations').expect(200);
  await agent.put('/api/automations/balance').set(H).send({ ...body.settings.balance, enabled: true }).expect(200);
  await tg(111, { text: 'Berapa baki saya?' });
  assert.match(last().text, /Hello Aisyah, here is the latest statement for Unit A-12-03[\s\S]*RM 1,245\.00/);
  await tg(111, { text: '/balance' });
  assert.match(last().text, /latest statement/);
  await agent.post('/api/inbox/reply').set(H).send({ channel: 'telegram', address: '60121112222', body: 'Noted, thank you!' }).expect(201);
  assert.deepEqual([last().chatId, last().text], ['111', 'Noted, thank you!']);
  const thread = await agent.get('/api/inbox/thread').query({ channel: 'telegram', address: '60121112222' }).expect(200);
  assert.ok(thread.body.messages.some((m) => m.auto && /latest statement/.test(m.body)));
});

test('people not in the list get the bilingual privacy notice after sharing their number', async () => {
  const { body } = await agent.get('/api/automations');
  await agent.put('/api/automations/privacy').set(H).send({ ...body.settings.privacy, enabled: true }).expect(200);
  await tg(222, { text: '/start' });
  await tg(222, { contact: { phone_number: '60199991234', user_id: 222 }, first: 'Rizal' });
  const notice = last().text;
  assert.match(notice, /Act 709[\s\S]*Act A1727[\s\S]*Telegram, WhatsApp\/Meta[\s\S]*Nicco Tan[\s\S]*Sila balas YA atau TIDAK/);
  assert.match(mockOutbox.at(-2).text, /received your number/);
  await tg(222, { text: 'Ya' });
  assert.match(last().text, /persetujuan anda telah direkodkan/);
  const c = (await agent.get('/api/automations/consents').expect(200)).body.consents;
  assert.deepEqual(c.map((x) => [x.channel, x.address, x.status, x.profile_name]), [['telegram', '60199991234', 'accepted', 'Rizal']]);
  // residents who link never get the notice
  await tg(333, { contact: { phone_number: '60122223333', user_id: 333 }, first: 'Ben' });
  assert.match(last().text, /linked to Unit B-08-01/);
});

test('settings report the Telegram channel; audit chain intact', async () => {
  const st = (await agent.get('/api/settings/status').expect(200)).body;
  assert.equal(st.chatChannel, 'telegram');
  assert.equal(st.telegram.mode, 'mock');
  assert.equal(st.telegram.linked, 3);
  assert.equal(st.telegram.blocked, 1);
  const dash = (await agent.get('/api/dashboard').expect(200)).body;
  assert.equal(dash.contacts.telegram, 2);
  assert.equal((await verifyChain()).ok, true);
});
