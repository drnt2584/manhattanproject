import { query } from '../db.js';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import { getSetting } from './settings.js';
import { activeSource, syncSource } from './sources.js';
import { sendChatText } from './chat.js';
import { email } from '../providers/email.js';
import { contactVariables, render } from '../lib/template.js';

const RESYNC_AFTER_MS = 60_000;

const clean = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words that may follow a one-word answer without changing it ("yes please", "ya betul")
const FILLERS = new Set(['please', 'thanks', 'thank', 'you', 'sure', 'lah', 'je', 'betul', 'boleh', 'terima', 'kasih', 'sila']);

/**
 * 'yes' | 'no' | null. Multi-word phrases ("i do not agree", "tidak setuju") match
 * anywhere; a single word ("ya", "tidak") must be the whole answer or be followed
 * only by fillers, so "tidak faham" (don't understand) is not read as a refusal.
 */
export function classifyConsent(body, cfg) {
  const t = clean(body);
  if (!t) return null;
  const tokens = t.split(' ');
  const matches = (list) => {
    const phrases = list.map(clean).filter(Boolean);
    const singles = new Set(phrases.filter((w) => !w.includes(' ')));
    if (phrases.some((w) => w.includes(' ') && new RegExp(`(^| )${escapeRe(w)}( |$)`).test(t))) return true;
    return singles.has(tokens[0]) && tokens.slice(1).every((x) => FILLERS.has(x) || singles.has(x));
  };
  // "no" first so "no, I do not agree" is never read as agreement
  if (matches(cfg.no_words)) return 'no';
  if (matches(cfg.yes_words)) return 'yes';
  return null;
}

export function isBalanceQuestion(body, keywords) {
  const t = clean(body);
  return keywords.some((k) => new RegExp(`(^|\\s)${escapeRe(clean(k))}(\\s|$)`).test(t));
}

async function findContacts(channel, address) {
  const col = channel === 'email' ? 'email' : 'whatsapp'; // chat channels are keyed by phone number
  const { rows } = await query(
    `SELECT c.* FROM contacts c JOIN data_sources s ON s.id = c.source_id AND s.is_active
      WHERE c.${col} = $1 ORDER BY c.row_number`, [address]);
  return rows;
}

/** Send an automatic reply, store it in the inbox thread and audit it. */
async function autoReply(msg, kind, text, contactName = null) {
  let providerId;
  let subject = null;
  try {
    if (msg.channel !== 'email') {
      providerId = (await sendChatText(msg.channel, msg.address, text)).id;
    } else {
      subject = `Re: ${(msg.subject || 'Your message').replace(/^(re:\s*)+/i, '')}`;
      providerId = (await email.send({ to: msg.address, subject, text, inReplyTo: msg.provider_message_id, references: msg.provider_message_id })).id;
    }
  } catch (err) {
    await audit({ event: 'auto_reply_failed', actor: 'automation', channel: msg.channel, direction: 'outbound', contact_name: contactName, address: msg.address, status: 'failed', error: err.message, details: { kind, body: text } });
    logger.warn({ err: err.message, kind, address: msg.address }, 'auto reply failed');
    return null;
  }
  await query(
    `INSERT INTO messages (channel, direction, address, contact_name, subject, body, provider_message_id, in_reply_to, is_read, auto)
     VALUES ($1,'outbound',$2,$3,$4,$5,$6,$7,TRUE,TRUE)`,
    [msg.channel, msg.address, contactName ?? msg.contact_name, subject, text, providerId, msg.provider_message_id ?? null]);
  await audit({
    event: 'auto_reply_sent', actor: 'automation', channel: msg.channel, direction: 'outbound', contact_name: contactName ?? msg.contact_name,
    address: msg.address, status: 'sent', provider_message_id: providerId, details: { kind, subject, body: text },
  });
  return providerId;
}

async function handlePrivacy(msg, cfg, known) {
  const { rows: [consent] } = await query('SELECT * FROM consents WHERE channel = $1 AND address = $2', [msg.channel, msg.address]);

  if (consent?.status === 'pending') {
    const answer = classifyConsent(msg.body, cfg);
    if (!answer) {
      await autoReply(msg, 'privacy_invalid', cfg.invalid_reply);
      return true;
    }
    const status = answer === 'yes' ? 'accepted' : 'declined';
    await query('UPDATE consents SET status = $3, responded_at = now(), response_text = $4 WHERE channel = $1 AND address = $2',
      [msg.channel, msg.address, status, msg.body.slice(0, 500)]);
    await audit({
      event: status === 'accepted' ? 'privacy_consent_accepted' : 'privacy_consent_declined', actor: `inbound:${msg.channel}`,
      channel: msg.channel, direction: 'inbound', contact_name: consent.profile_name, address: msg.address, status, details: { response: msg.body },
    });
    await autoReply(msg, `privacy_${status}`, status === 'accepted' ? cfg.accepted_reply : cfg.declined_reply);
    return true;
  }

  if (!consent && !known) {
    // First message from someone who is not in the contact list
    await query(
      `INSERT INTO consents (channel, address, profile_name, status, notice_sent_at) VALUES ($1,$2,$3,'pending',now())
       ON CONFLICT (channel, address) DO NOTHING`, [msg.channel, msg.address, msg.contact_name ?? msg.profile_name ?? null]);
    await audit({ event: 'privacy_notice_sent', actor: 'automation', channel: msg.channel, direction: 'outbound', address: msg.address, status: 'pending', details: { first_message: msg.body } });
    await autoReply(msg, 'privacy_notice', cfg.notice);
    return true;
  }
  return false;
}

/** Build the balance reply for everyone (every unit) linked to this number or email, from the latest sheet data. */
export async function balanceReplyText(channel, address, cfg = null) {
  cfg = cfg ?? (await getSetting('balance'));
  const reminders = await getSetting('reminders');
  const source = await activeSource();
  if (source?.kind === 'google_sheet' && (!source.last_synced_at || Date.now() - new Date(source.last_synced_at).getTime() > RESYNC_AFTER_MS)) {
    try {
      await syncSource(source.id, { actor: 'automation' });
    } catch (err) {
      logger.warn({ err: err.message }, 'sheet re-sync before balance reply failed; using last snapshot');
    }
  }
  const contacts = await findContacts(channel, address);
  if (!contacts.length) return { text: cfg.not_found_reply, contacts };
  const unpaid = reminders.unpaid_statuses.map((s) => s.toLowerCase());
  const parts = contacts.map((c) => {
    const r = render(unpaid.includes(c.status) ? cfg.reply : cfg.paid_reply, contactVariables(c));
    return r.missing.length ? null : r.text;
  });
  if (parts.some((p) => p === null)) return { text: null, contacts, error: 'The sheet is missing values used by the balance reply' };
  return { text: parts.join('\n\n'), contacts };
}

async function handleBalance(msg, cfg) {
  if (!isBalanceQuestion(msg.body, cfg.keywords)) return false;
  const { text, contacts, error } = await balanceReplyText(msg.channel, msg.address, cfg);
  await audit({ event: 'balance_inquiry', actor: `inbound:${msg.channel}`, channel: msg.channel, direction: 'inbound', contact_name: contacts[0]?.name ?? null, address: msg.address, status: contacts.length ? 'found' : 'not_found', error: error ?? null, details: { question: msg.body, rows: contacts.map((c) => c.row_number) } });
  if (!text) return false; // leave it for the admin to answer
  await autoReply(msg, 'balance', text, contacts[0]?.name ?? null);
  return true;
}

/** Run automations for newly received messages (privacy notice first, then balance questions). */
export async function runAutomations(messages) {
  for (const msg of messages.filter(Boolean)) {
    try {
      const known = (await findContacts(msg.channel, msg.address)).length > 0;
      if (msg.channel !== 'email') {
        const privacy = await getSetting('privacy');
        if (privacy.enabled && (await handlePrivacy(msg, privacy, known))) continue;
      }
      const balance = await getSetting('balance');
      if (balance.enabled) await handleBalance(msg, balance);
    } catch (err) {
      logger.error({ err, messageId: msg.id }, 'automation failed');
    }
  }
}
