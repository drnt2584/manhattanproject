import crypto from 'node:crypto';
import { config } from '../config.js';
import { SendError } from '../lib/errors.js';
import { logger } from '../logger.js';

/**
 * WhatsApp Business Cloud API (Meta).
 * - Business-initiated messages MUST use a pre-approved template (payload.template).
 * - Free-form text (payload.text) only works inside the 24h window after the
 *   contact last messaged you — which is the case for admin replies from the inbox.
 */
async function metaSend(to, payload) {
  const { graphBaseUrl, apiVersion, phoneNumberId, accessToken } = config.whatsapp;
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  if (payload.template) {
    body.type = 'template';
    body.template = {
      name: payload.template.name,
      language: { code: payload.template.language || 'en' },
      components: payload.template.params?.length
        ? [{ type: 'body', parameters: payload.template.params.map((text) => ({ type: 'text', text: String(text) })) }]
        : [],
    };
  } else {
    body.type = 'text';
    body.text = { body: payload.text, preview_url: false };
  }
  let res;
  try {
    res = await fetch(`${graphBaseUrl}/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new SendError(`WhatsApp network error: ${err.message}`, { transient: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error || {};
    // 429 / 5xx / Meta throttling codes are worth retrying
    const transient = res.status === 429 || res.status >= 500 || [4, 80007, 130429, 131048, 131056].includes(e.code);
    const detail = e.error_data?.details ? ` — ${e.error_data.details}` : '';
    throw new SendError(`WhatsApp API ${res.status}: ${e.message || 'unknown error'}${detail}`, { transient, code: e.code, raw: json });
  }
  return { id: json.messages?.[0]?.id ?? null };
}

/** Local/dev provider: succeeds, except numbers ending in 0000 fail (to exercise failure handling). */
async function mockSend(to, payload) {
  await new Promise((r) => setTimeout(r, 20));
  if (to.endsWith('0000')) throw new SendError('Mock: recipient is not a WhatsApp user (131026)', { code: 131026 });
  const id = 'wamid.mock.' + crypto.randomUUID();
  logger.info({ to, payload }, '[mock whatsapp] sent');
  return { id };
}

export const whatsapp = {
  name: () => config.whatsapp.provider,
  send: (to, payload) => (config.whatsapp.provider === 'meta' ? metaSend(to, payload) : mockSend(to, payload)),
};

/** Validate the X-Hub-Signature-256 header Meta sends with webhooks. */
export function verifyWebhookSignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return config.whatsapp.provider !== 'meta';
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const given = header.slice(7);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
