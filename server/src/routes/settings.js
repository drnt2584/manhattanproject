import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { audit } from '../services/audit.js';
import { whatsapp } from '../providers/whatsapp.js';
import { email } from '../providers/email.js';
import { normalizePhone, normalizeEmail } from '../lib/normalize.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();

/** What's configured — never returns secrets. */
r.get('/status', (_req, res) => {
  const w = config.whatsapp;
  const e = config.email;
  res.json({
    publicUrl: config.publicUrl,
    timezone: config.timezone,
    defaultCountryCode: config.defaultCountryCode,
    adminNotifyEmails: config.adminNotifyEmails,
    whatsapp: { provider: w.provider, phoneNumberId: w.phoneNumberId ? `…${w.phoneNumberId.slice(-4)}` : null, tokenSet: !!w.accessToken, appSecretSet: !!w.appSecret, verifyTokenSet: !!w.verifyToken, webhookUrl: `${config.publicUrl}/webhooks/whatsapp` },
    email: { provider: e.provider, from: e.from, smtpHost: e.smtpHost || null, imapEnabled: e.imapEnabled, imapHost: e.imapHost || null },
    googleServiceAccount: !!config.google.serviceAccountFile,
  });
});

r.post('/test', async (req, res) => {
  const b = parse(z.object({ channel: z.enum(['whatsapp', 'email']), to: z.string().min(3), template_name: z.string().optional(), language: z.string().optional() }), req.body);
  const to = b.channel === 'whatsapp' ? normalizePhone(b.to) : normalizeEmail(b.to);
  if (!to) throw new HttpError(400, 'That address is not valid');
  try {
    const result = b.channel === 'whatsapp'
      ? await whatsapp.send(to, b.template_name ? { template: { name: b.template_name, language: b.language || 'en_US', params: [] } } : { text: 'Test message from Notify.' })
      : await email.send({ to, subject: 'Notify test email', text: 'This is a test email from Notify. If you can read this, email sending works.' });
    await audit({ event: 'test_sent', actor: actor(req), channel: b.channel, direction: 'outbound', address: to, status: 'sent', provider_message_id: result.id });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    await audit({ event: 'test_failed', actor: actor(req), channel: b.channel, direction: 'outbound', address: to, status: 'failed', error: err.message });
    throw new HttpError(502, err.message);
  }
});

export default r;
