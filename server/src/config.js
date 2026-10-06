import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: process.env.ENV_FILE || path.resolve(here, '../.env'), quiet: true });

const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: int(env.PORT, 4000),
  host: env.HOST || '127.0.0.1',
  publicUrl: (env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
  logLevel: env.LOG_LEVEL || 'info',
  logFile: env.LOG_FILE || '',

  databaseUrl: env.DATABASE_URL || 'postgres://notify:notify@localhost:5432/notify',
  dbPoolMax: int(env.DB_POOL_MAX, 10),
  skipMigrations: bool(env.SKIP_MIGRATIONS, false), // set when the app runs as a restricted DB role

  sessionSecret: env.SESSION_SECRET || '',
  sessionHours: int(env.SESSION_HOURS, 12),
  cookieSecure: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
  adminEmail: env.ADMIN_EMAIL || '',
  adminPassword: env.ADMIN_PASSWORD || '',

  timezone: env.APP_TIMEZONE || 'UTC',
  defaultCountryCode: (env.DEFAULT_COUNTRY_CODE || '').replace(/\D/g, ''),
  amountLocale: env.AMOUNT_LOCALE || 'en-US',
  amountCurrency: env.AMOUNT_CURRENCY || '',
  amountDecimals: int(env.AMOUNT_DECIMALS, 2),
  // How to read ambiguous dates like 03/04/2026 in the sheet: DMY (Malaysia, UK) or MDY (US)
  dateFormat: (env.DATE_FORMAT || 'MDY').toUpperCase() === 'DMY' ? 'DMY' : 'MDY',
  maxUploadMb: int(env.MAX_UPLOAD_MB, 10),

  adminNotifyEmails: list(env.ADMIN_NOTIFY_EMAILS),

  whatsapp: {
    // WhatsApp is used for residents who have not joined Telegram (or for everyone if Telegram is off)
    enabled: bool(env.WHATSAPP_ENABLED, true),
    provider: env.WHATSAPP_PROVIDER || 'mock', // 'meta' | 'mock'
    apiVersion: env.WHATSAPP_API_VERSION || 'v22.0',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: env.WHATSAPP_ACCESS_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    concurrency: int(env.WHATSAPP_CONCURRENCY, 5),
    graphBaseUrl: env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com',
  },

  telegram: {
    // Telegram is used for every resident who has joined the bot; it takes priority over WhatsApp
    enabled: bool(env.TELEGRAM_ENABLED, false),
    botToken: env.TELEGRAM_BOT_TOKEN || '', // empty = mock mode
    apiBase: env.TELEGRAM_API_URL || 'https://api.telegram.org',
    concurrency: int(env.TELEGRAM_CONCURRENCY, 5), // Telegram allows ~30 msg/s overall
  },

  email: {
    provider: env.EMAIL_PROVIDER || 'mock', // 'smtp' | 'mock'
    from: env.EMAIL_FROM || 'Notifications <no-reply@example.com>',
    replyTo: env.EMAIL_REPLY_TO || '',
    smtpHost: env.SMTP_HOST || '',
    smtpPort: int(env.SMTP_PORT, 587),
    smtpSecure: bool(env.SMTP_SECURE, false),
    smtpUser: env.SMTP_USER || '',
    smtpPass: env.SMTP_PASS || '',
    concurrency: int(env.EMAIL_CONCURRENCY, 3),
    imapEnabled: bool(env.IMAP_ENABLED, false),
    imapHost: env.IMAP_HOST || '',
    imapPort: int(env.IMAP_PORT, 993),
    imapSecure: bool(env.IMAP_SECURE, true),
    imapUser: env.IMAP_USER || env.SMTP_USER || '',
    imapPass: env.IMAP_PASS || env.SMTP_PASS || '',
    imapMailbox: env.IMAP_MAILBOX || 'INBOX',
    imapPollMs: int(env.IMAP_POLL_MS, 60_000),
  },

  google: {
    serviceAccountFile: env.GOOGLE_SERVICE_ACCOUNT_FILE || '',
  },

  worker: {
    pollMs: int(env.WORKER_POLL_MS, 5_000),
    staleRunMs: int(env.STALE_RUN_MS, 120_000),
    maxAttempts: int(env.SEND_MAX_ATTEMPTS, 3),
    retryBaseMs: int(env.SEND_RETRY_BASE_MS, 1_000),
  },
};

/** Chat channels that are switched on, in priority order. */
export function chatChannels() {
  return [config.telegram.enabled && 'telegram', config.whatsapp.enabled && 'whatsapp'].filter(Boolean);
}

export function assertProductionConfig() {
  const problems = [];
  if (!config.sessionSecret || config.sessionSecret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  if (config.isProd && config.telegram.enabled && !config.telegram.botToken) problems.push('TELEGRAM_BOT_TOKEN is required when TELEGRAM_ENABLED=true');
  if (config.isProd && config.whatsapp.enabled && config.whatsapp.provider === 'meta') {
    for (const k of ['phoneNumberId', 'accessToken', 'appSecret', 'verifyToken']) {
      if (!config.whatsapp[k]) problems.push(`WHATSAPP_${k.replace(/[A-Z]/g, (c) => '_' + c).toUpperCase()} is required`);
    }
  }
  if (config.isProd && config.email.provider === 'smtp' && !config.email.smtpHost) problems.push('SMTP_HOST is required');
  if (problems.length) throw new Error('Invalid configuration:\n - ' + problems.join('\n - '));
}
