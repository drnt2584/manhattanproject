import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { SendError } from '../lib/errors.js';
import { logger } from '../logger.js';
import { textToHtml } from '../lib/template.js';

let transport = null;
function smtp() {
  if (!transport) {
    const e = config.email;
    transport = nodemailer.createTransport({
      host: e.smtpHost,
      port: e.smtpPort,
      secure: e.smtpSecure,
      auth: e.smtpUser ? { user: e.smtpUser, pass: e.smtpPass } : undefined,
      pool: true,
      maxConnections: Math.max(1, e.concurrency),
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  return transport;
}

function domainOf(from) {
  return (String(from).match(/@([^>\s]+)/) || [])[1] || 'localhost';
}

/**
 * Send a plain-text email (an HTML version is generated). Returns the
 * Message-ID so replies can be threaded back to the original send.
 */
async function send({ to, subject, text, inReplyTo, references }) {
  const messageId = `<${crypto.randomUUID()}@${domainOf(config.email.from)}>`;
  const msg = {
    from: config.email.from,
    to,
    subject,
    text,
    html: textToHtml(text),
    messageId,
    replyTo: config.email.replyTo || undefined,
    inReplyTo: inReplyTo || undefined,
    references: references || inReplyTo || undefined,
  };
  if (config.email.provider !== 'smtp') {
    await new Promise((r) => setTimeout(r, 20));
    if (/fail/i.test(to)) throw new SendError('Mock: 550 mailbox unavailable', { code: 550 });
    logger.info({ to, subject }, '[mock email] sent');
    return { id: messageId };
  }
  try {
    await smtp().sendMail(msg);
    return { id: messageId };
  } catch (err) {
    const code = err.responseCode;
    const transient = !code || (code >= 400 && code < 500) || ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET'].includes(err.code);
    throw new SendError(`SMTP: ${err.response || err.message}`, { transient, code: code ?? err.code });
  }
}

export const email = { name: () => config.email.provider, send };
