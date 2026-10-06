import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config } from '../config.js';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { isKnownAddress, recordInbound } from './inbound.js';
import { runAutomations } from './automations.js';

/** Strip the quoted original message from a reply so the inbox shows only the response. */
export function stripQuoted(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^From:\s.+/i.test(line) && out.length) break;
    if (/^>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

/**
 * Poll the mailbox for new mail and store only replies: messages answering one of
 * our sends (In-Reply-To/References) or coming from a known contact address.
 */
export async function pollImap() {
  const e = config.email;
  if (!e.imapEnabled) return 0;
  const client = new ImapFlow({
    host: e.imapHost, port: e.imapPort, secure: e.imapSecure,
    auth: { user: e.imapUser, pass: e.imapPass }, logger: false,
  });
  let stored = 0;
  await client.connect();
  const lock = await client.getMailboxLock(e.imapMailbox);
  try {
    const box = client.mailbox;
    const { rows } = await query('SELECT * FROM imap_state WHERE mailbox = $1', [e.imapMailbox]);
    let state = rows[0];
    if (!state || Number(state.uidvalidity) !== Number(box.uidValidity)) {
      // First run: start from now, don't import the whole mailbox history.
      state = { uidvalidity: Number(box.uidValidity), last_uid: Math.max(0, Number(box.uidNext) - 1) };
      await query(
        `INSERT INTO imap_state (mailbox, uidvalidity, last_uid) VALUES ($1,$2,$3)
         ON CONFLICT (mailbox) DO UPDATE SET uidvalidity = EXCLUDED.uidvalidity, last_uid = EXCLUDED.last_uid`,
        [e.imapMailbox, state.uidvalidity, state.last_uid]);
      return 0;
    }
    let maxUid = Number(state.last_uid);
    for await (const msg of client.fetch({ uid: `${maxUid + 1}:*` }, { uid: true, source: true }, { uid: true })) {
      if (msg.uid <= maxUid) continue;
      maxUid = msg.uid;
      const mail = await simpleParser(msg.source);
      const from = mail.from?.value?.[0]?.address?.toLowerCase();
      if (!from) continue;
      const refs = [mail.inReplyTo, ...(Array.isArray(mail.references) ? mail.references : [mail.references])].filter(Boolean);
      let runRecipientId = null;
      if (refs.length) {
        const r = await query("SELECT id FROM run_recipients WHERE channel = 'email' AND provider_message_id = ANY($1) LIMIT 1", [refs]);
        runRecipientId = r.rows[0]?.id ?? null;
        if (!runRecipientId) {
          const m = await query("SELECT 1 FROM messages WHERE channel = 'email' AND provider_message_id = ANY($1) LIMIT 1", [refs]);
          if (m.rowCount) runRecipientId = null; // reply to an admin reply; still a known thread
          else if (!(await isKnownAddress('email', from))) continue;
        }
      } else if (!(await isKnownAddress('email', from))) {
        continue; // not a reply to us — ignore
      }
      const saved = await recordInbound({
        channel: 'email', address: from, name: mail.from.value[0].name || null, subject: mail.subject || '',
        body: stripQuoted(mail.text || '') || '(empty message)', providerMessageId: mail.messageId || `imap-${box.uidValidity}-${msg.uid}`,
        inReplyTo: mail.inReplyTo || null, runRecipientId,
      });
      if (saved) {
        stored++;
        await runAutomations([saved]);
      }
    }
    await query('UPDATE imap_state SET last_uid = $2 WHERE mailbox = $1', [e.imapMailbox, maxUid]);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  if (stored) logger.info({ stored }, 'email replies stored');
  return stored;
}
