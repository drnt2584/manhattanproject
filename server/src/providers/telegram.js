import { config } from '../config.js';
import { SendError } from '../lib/errors.js';
import { logger } from '../logger.js';

/** Messages "sent" in mock mode, newest last (used by tests and local development). */
export const mockOutbox = [];

async function call(method, body, timeoutMs = 20_000) {
  const { apiBase, botToken } = config.telegram;
  let res;
  try {
    res = await fetch(`${apiBase}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new SendError(`Telegram network error: ${err.message}`, { transient: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    const code = json.error_code ?? res.status;
    // 429 = flood control (retry_after given), 5xx = Telegram side; 403 = user blocked the bot
    const transient = code === 429 || code >= 500;
    throw new SendError(`Telegram ${code}: ${json.description || 'unknown error'}`, { transient, code, raw: json });
  }
  return json.result;
}

const isMock = () => !config.telegram.botToken;

export const telegram = {
  name: () => (isMock() ? 'mock' : 'bot'),

  /** Send a text message to a chat. `extra` can carry reply_markup etc. */
  async send(chatId, text, extra = {}) {
    if (isMock()) {
      if (String(chatId).endsWith('0000')) throw new SendError('Mock: Telegram 403: Forbidden: bot was blocked by the user', { code: 403 });
      mockOutbox.push({ chatId: String(chatId), text, extra });
      logger.info({ chatId, text: text.slice(0, 80) }, '[mock telegram] sent');
      return { id: `${chatId}:mock${mockOutbox.length}` };
    }
    const msg = await call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...extra });
    return { id: `${msg.chat.id}:${msg.message_id}` };
  },

  getMe: () => (isMock() ? Promise.resolve({ username: 'mock_bot' }) : call('getMe', {})),
  deleteWebhook: () => (isMock() ? Promise.resolve(true) : call('deleteWebhook', { drop_pending_updates: false })),
  getUpdates: (offset, timeout = 25) => call('getUpdates', { offset, timeout, allowed_updates: ['message'] }, (timeout + 10) * 1000),
};
