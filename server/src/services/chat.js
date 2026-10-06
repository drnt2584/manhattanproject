import { query } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { whatsapp } from '../providers/whatsapp.js';
import { telegram } from '../providers/telegram.js';

/**
 * Chat addresses: WhatsApp uses the phone number. Telegram uses the phone number
 * once the chat is linked, or "tg:<chat id>" for someone who hasn't shared it yet.
 */
export async function telegramChatId(address) {
  if (String(address).startsWith('tg:')) return address.slice(3);
  const { rows } = await query('SELECT chat_id FROM telegram_links WHERE phone = $1 AND blocked_at IS NULL ORDER BY linked_at DESC LIMIT 1', [address]);
  return rows[0]?.chat_id ?? null;
}

/** Linked Telegram chats by phone number. */
export async function telegramLinks() {
  const { rows } = await query('SELECT phone, chat_id FROM telegram_links WHERE blocked_at IS NULL ORDER BY linked_at');
  return new Map(rows.map((r) => [r.phone, r.chat_id]));
}

/** Free-text message on a chat channel (inbox replies, automatic replies). */
export async function sendChatText(channel, address, text, extra = {}) {
  if (channel === 'whatsapp') return whatsapp.send(address, { text });
  if (channel === 'telegram') {
    const chatId = await telegramChatId(address);
    if (!chatId) throw new HttpError(400, 'This person has not linked Telegram (they need to open the bot and share their number)');
    return telegram.send(chatId, text, extra);
  }
  throw new Error(`not a chat channel: ${channel}`);
}
