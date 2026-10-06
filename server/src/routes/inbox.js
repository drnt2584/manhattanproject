import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { audit } from '../services/audit.js';
import { whatsapp } from '../providers/whatsapp.js';
import { email } from '../providers/email.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();

/** One row per conversation (channel + address), newest first. */
r.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === '1';
  const { rows } = await query(
    `SELECT channel, address,
            max(contact_name) FILTER (WHERE contact_name IS NOT NULL) AS contact_name,
            max(created_at) AS last_at,
            count(*) FILTER (WHERE direction = 'inbound' AND NOT is_read)::int AS unread,
            (array_agg(body ORDER BY created_at DESC))[1] AS last_body,
            (array_agg(direction ORDER BY created_at DESC))[1] AS last_direction
       FROM messages GROUP BY channel, address
     ${unreadOnly ? "HAVING count(*) FILTER (WHERE direction = 'inbound' AND NOT is_read) > 0" : ''}
      ORDER BY last_at DESC LIMIT 200`);
  res.json({ conversations: rows });
});

r.get('/thread', async (req, res) => {
  const { channel, address } = parse(z.object({ channel: z.enum(['whatsapp', 'email']), address: z.string().min(3) }), req.query);
  const { rows } = await query(
    `SELECT m.*, a.email AS sent_by_email FROM messages m LEFT JOIN admins a ON a.id = m.sent_by
      WHERE m.channel = $1 AND m.address = $2 ORDER BY m.created_at`, [channel, address]);
  // The notifications we sent this person, for context
  const { rows: sends } = await query(
    `SELECT run_id, rendered_subject, rendered_body, sent_at FROM run_recipients
      WHERE channel = $1 AND address = $2 AND state = 'sent' ORDER BY sent_at DESC LIMIT 5`, [channel, address]);
  await query("UPDATE messages SET is_read = TRUE WHERE channel = $1 AND address = $2 AND direction = 'inbound' AND NOT is_read", [channel, address]);
  res.json({ messages: rows, notifications: sends });
});

r.post('/reply', async (req, res) => {
  const b = parse(z.object({
    channel: z.enum(['whatsapp', 'email']), address: z.string().min(3), body: z.string().trim().min(1).max(4096),
    subject: z.string().max(300).optional(),
  }), req.body);
  const { rows: [lastIn] } = await query(
    `SELECT * FROM messages WHERE channel = $1 AND address = $2 AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`, [b.channel, b.address]);
  if (!lastIn) throw new HttpError(400, 'You can only reply to contacts who have messaged you');

  let providerId;
  let subject = null;
  try {
    if (b.channel === 'whatsapp') {
      // Free-form text is allowed within 24h of the contact's last message
      if (Date.now() - new Date(lastIn.created_at).getTime() > 24 * 3600_000) {
        throw new HttpError(400, 'WhatsApp only allows free-form replies within 24 hours of the contact\'s last message. Send an approved template instead.');
      }
      providerId = (await whatsapp.send(b.address, { text: b.body })).id;
    } else {
      const base = (lastIn.subject || 'Your message').replace(/^(re:\s*)+/i, '');
      subject = b.subject || `Re: ${base}`;
      providerId = (await email.send({ to: b.address, subject, text: b.body, inReplyTo: lastIn.provider_message_id, references: lastIn.provider_message_id })).id;
    }
  } catch (err) {
    await audit({ event: 'reply_failed', actor: actor(req), channel: b.channel, direction: 'outbound', address: b.address, status: 'failed', error: err.message, details: { body: b.body } });
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `Could not send: ${err.message}`);
  }
  const { rows: [msg] } = await query(
    `INSERT INTO messages (channel, direction, address, contact_name, subject, body, provider_message_id, in_reply_to, is_read, sent_by)
     VALUES ($1,'outbound',$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING *`,
    [b.channel, b.address, lastIn.contact_name, subject, b.body, providerId, lastIn.provider_message_id, req.admin.id]);
  await audit({
    event: 'reply_sent', actor: actor(req), channel: b.channel, direction: 'outbound', contact_name: lastIn.contact_name,
    address: b.address, status: 'sent', provider_message_id: providerId, details: { subject, body: b.body },
  });
  res.status(201).json({ message: msg });
});

export default r;
