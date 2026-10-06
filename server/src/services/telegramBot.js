import { query } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { audit } from './audit.js';
import { getSetting, saveSetting } from './settings.js';
import { recordInbound } from './inbound.js';
import { runAutomations } from './automations.js';
import { telegram } from '../providers/telegram.js';
import { normalizePhone } from '../lib/normalize.js';
import { contactVariables, render } from '../lib/template.js';
import { sleep } from '../lib/concurrency.js';

const shareKeyboard = (cfg) => ({
  reply_markup: { keyboard: [[{ text: cfg.share_button, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
});
const removeKeyboard = { reply_markup: { remove_keyboard: true } };

async function reply(chatId, text, extra = {}, kind = 'telegram_bot') {
  try {
    await telegram.send(chatId, text, extra);
  } catch (err) {
    logger.warn({ err: err.message, chatId, kind }, 'telegram reply failed');
  }
}

async function activeContacts(phone) {
  const { rows } = await query(
    `SELECT c.* FROM contacts c JOIN data_sources s ON s.id = c.source_id AND s.is_active
      WHERE c.whatsapp = $1 ORDER BY c.row_number`, [phone]);
  return rows;
}

/** The person shared a phone number: link this chat to it. */
async function linkContact(m, cfg) {
  const chatId = String(m.chat.id);
  if (String(m.contact.user_id) !== String(m.from.id)) {
    await reply(chatId, cfg.not_own_number, shareKeyboard(cfg));
    return;
  }
  const phone = normalizePhone('+' + String(m.contact.phone_number).replace(/^\+/, ''));
  if (!phone) {
    await reply(chatId, cfg.not_own_number, shareKeyboard(cfg));
    return;
  }
  await query(
    `INSERT INTO telegram_links (chat_id, phone, user_id, username, first_name) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (chat_id) DO UPDATE SET phone = EXCLUDED.phone, user_id = EXCLUDED.user_id, username = EXCLUDED.username,
       first_name = EXCLUDED.first_name, linked_at = now(), blocked_at = NULL`,
    [chatId, phone, m.from.id, m.from.username ?? null, m.from.first_name ?? null]);
  // Messages sent before linking were filed under the chat id; move them to the phone-number thread
  await query("UPDATE messages SET address = $1 WHERE channel = 'telegram' AND address = $2", [phone, `tg:${chatId}`]);
  const contacts = await activeContacts(phone);
  await audit({
    event: 'telegram_linked', actor: 'inbound:telegram', channel: 'telegram', direction: 'inbound', contact_name: contacts[0]?.name ?? m.from.first_name ?? null,
    address: phone, status: contacts.length ? 'resident' : 'not_in_list', details: { chat_id: chatId, username: m.from.username ?? null, rows: contacts.map((c) => c.row_number) },
  });

  if (contacts.length) {
    const r = render(cfg.linked_reply, { ...contactVariables(contacts[0]), unit: contacts.map((c) => c.fields?.unit).filter(Boolean).join(', ') || '-' });
    await reply(chatId, r.text, removeKeyboard);
    return;
  }
  // Not a resident in the sheet: the Data Privacy Notice flow takes over
  await reply(chatId, cfg.number_received, removeKeyboard);
  await runAutomations([{ channel: 'telegram', address: phone, body: '', contact_name: null, profile_name: [m.from.first_name, m.from.last_name].filter(Boolean).join(' ') || null }]);
}

/** Handle one Telegram update (from long polling). */
export async function handleTelegramUpdate(update) {
  const m = update.message;
  if (!m || m.chat?.type !== 'private') return; // ignore groups/channels
  const cfg = await getSetting('telegram');
  const chatId = String(m.chat.id);

  if (m.contact) return linkContact(m, cfg);

  const { rows: [link] } = await query('SELECT * FROM telegram_links WHERE chat_id = $1', [chatId]);
  if (link?.blocked_at) await query('UPDATE telegram_links SET blocked_at = NULL WHERE chat_id = $1', [chatId]);
  const text = (m.text ?? m.caption ?? '').trim();
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || null;

  if (text.startsWith('/start') || text.startsWith('/link')) {
    await reply(chatId, link ? cfg.already_linked : cfg.welcome, link ? removeKeyboard : shareKeyboard(cfg));
    return;
  }
  if (!link) {
    // Keep what they wrote for the admin, and ask them to share their number first
    await recordInbound({ channel: 'telegram', address: `tg:${chatId}`, body: text || `[${Object.keys(m).find((k) => ['photo', 'document', 'voice', 'sticker', 'video'].includes(k)) ?? 'message'}]`, providerMessageId: `${chatId}:${m.message_id}`, name });
    await reply(chatId, cfg.share_prompt, shareKeyboard(cfg));
    return;
  }

  const body = text === '/balance' || text === '/baki' ? 'balance' : text || '[attachment]';
  const saved = await recordInbound({
    channel: 'telegram', address: link.phone, body, providerMessageId: `${chatId}:${m.message_id}`,
    raw: { profile_name: name, username: m.from?.username ?? null },
  });
  if (saved) await runAutomations([{ ...saved, profile_name: name }]);
}

/** Worker loop: long-poll Telegram for new messages (no public URL needed). */
export async function telegramPollLoop(isStopping) {
  if (!config.telegram.enabled || !config.telegram.botToken) return;
  await telegram.deleteWebhook().catch(() => {});
  const me = await telegram.getMe().catch(() => null);
  logger.info({ bot: me?.username }, 'Telegram bot polling started');
  while (!isStopping()) {
    try {
      const saved = await getSetting('telegram_offset');
      const updates = await telegram.getUpdates(saved.offset ?? 0);
      for (const u of updates) {
        try {
          await handleTelegramUpdate(u);
        } catch (err) {
          logger.error({ err, updateId: u.update_id }, 'telegram update failed');
        }
        await saveSetting('telegram_offset', { offset: u.update_id + 1 });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Telegram polling error');
      await sleep(5000);
    }
  }
}
