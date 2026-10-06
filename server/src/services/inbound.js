import { query } from '../db.js';
import { audit } from './audit.js';
import { logger } from '../logger.js';

/** Find the most recent outbound send to this address so the reply can be linked to it. */
async function lastOutbound(channel, address) {
  const { rows } = await query(
    `SELECT id, contact_name FROM run_recipients WHERE channel = $1 AND address = $2 AND state = 'sent'
      ORDER BY sent_at DESC NULLS LAST LIMIT 1`, [channel, address]);
  return rows[0] ?? null;
}

async function contactName(channel, address) {
  const col = channel === 'whatsapp' ? 'whatsapp' : 'email';
  const { rows } = await query(
    `SELECT c.name FROM contacts c JOIN data_sources s ON s.id = c.source_id
      WHERE c.${col} = $1 ORDER BY s.is_active DESC, c.id DESC LIMIT 1`, [address]);
  return rows[0]?.name ?? null;
}

/** True if this address is someone we have notified (or is in the contact list). */
export async function isKnownAddress(channel, address) {
  if (await lastOutbound(channel, address)) return true;
  return !!(await contactName(channel, address));
}

/**
 * Store a reply from a contact. Returns null for duplicates (webhooks are retried
 * by Meta, IMAP can re-deliver).
 */
export async function recordInbound({ channel, address, body, subject = null, providerMessageId = null, inReplyTo = null, runRecipientId = null, name = null, raw = {} }) {
  const linked = runRecipientId ? { id: runRecipientId } : await lastOutbound(channel, address);
  // Sheet name first; for people not in the list fall back to their WhatsApp profile name
  const contact_name = name || linked?.contact_name || (await contactName(channel, address)) || raw.profile_name || null;
  const { rows } = await query(
    `INSERT INTO messages (channel, direction, address, contact_name, subject, body, provider_message_id, in_reply_to, run_recipient_id)
     VALUES ($1,'inbound',$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (channel, provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING RETURNING *`,
    [channel, address, contact_name, subject, body, providerMessageId, inReplyTo, linked?.id ?? null],
  );
  if (!rows.length) return null;
  await audit({
    event: 'reply_received', actor: `inbound:${channel}`, channel, direction: 'inbound', contact_name, address,
    status: 'received', provider_message_id: providerMessageId, details: { subject, body, in_reply_to: inReplyTo, ...raw },
  });
  logger.info({ channel, address }, 'reply received');
  return rows[0];
}

/** Handle a WhatsApp Cloud API webhook payload: inbound messages + delivery statuses. */
export async function handleWhatsappWebhook(payload) {
  const received = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages ?? []) {
        const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title
          ?? (m[m.type]?.caption ? `[${m.type}] ${m[m.type].caption}` : `[${m.type} message]`);
        let runRecipientId = null;
        if (m.context?.id) {
          const { rows } = await query('SELECT id FROM run_recipients WHERE provider_message_id = $1', [m.context.id]);
          runRecipientId = rows[0]?.id ?? null;
        }
        const saved = await recordInbound({
          channel: 'whatsapp', address: m.from, body, providerMessageId: m.id, inReplyTo: m.context?.id ?? null,
          runRecipientId, raw: { type: m.type, profile_name: names[m.from] ?? null },
        });
        if (saved) received.push({ ...saved, profile_name: names[m.from] ?? null });
      }
      // Delivery receipts are appended as new audit entries (the log is never updated).
      for (const s of v.statuses ?? []) {
        const { rows } = await query('SELECT run_id, contact_name FROM run_recipients WHERE provider_message_id = $1', [s.id]);
        await audit({
          event: 'delivery_status', actor: 'webhook:whatsapp', run_id: rows[0]?.run_id ?? null, channel: 'whatsapp', direction: 'outbound',
          contact_name: rows[0]?.contact_name ?? null, address: s.recipient_id, status: s.status, provider_message_id: s.id,
          error: s.errors?.map((e) => `${e.code}: ${e.title}${e.error_data?.details ? ' — ' + e.error_data.details : ''}`).join('; ') || null,
          details: { timestamp: s.timestamp, pricing: s.pricing ?? null },
        });
      }
    }
  }
  return received; // new (non-duplicate) inbound messages, for automations
}
