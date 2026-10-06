import { query } from '../db.js';

/** Built-in defaults; whatever the admin saves is merged over these. */
export const DEFAULTS = {
  reminders: {
    enabled: false,
    time: '09:00', // daily check, in APP_TIMEZONE
    unpaid_statuses: ['unpaid'],
    rules: [
      { days: 5, template: 'reminder_5' },
      { days: 14, template: 'reminder_14' },
      { days: 30, template: 'final_30' },
    ],
  },
  privacy: {
    enabled: false,
    notice: 'Hello! Before we continue, please read our Data Privacy Notice.\n\nWe collect your name, mobile number and the messages you send us only to respond to your inquiry. Your information is kept confidential and is not shared with third parties.\n\nDo you agree? Reply YES or NO.',
    accepted_reply: 'Thank you. Your consent has been recorded. How can we help you?',
    declined_reply: 'Understood. We have recorded that you do not consent, and we will not process your information further.',
    invalid_reply: 'Please reply YES if you agree to the Data Privacy Notice, or NO if you do not.',
    yes_words: ['yes', 'y', 'agree', 'i agree', 'accept', 'ok', 'ya', 'ye', 'setuju', 'saya setuju'],
    no_words: ['no', 'n', 'disagree', 'decline', 'i do not agree', "i don't agree", 'tidak', 'tak', 'tidak setuju', 'tak setuju'],
  },
  balance: {
    enabled: false,
    keywords: ['balance', 'bill', 'billing', 'dues', 'how much', 'outstanding', 'statement', 'soa', 'unpaid', 'owe', 'baki', 'bil', 'yuran', 'tunggakan', 'berapa'],
    reply: 'Hi {{first_name}}, your current balance is {{total_due_formatted}}, {{due_status}}. Please settle it as soon as possible.',
    paid_reply: 'Hi {{first_name}}, you have no unpaid balance. Thank you!',
    not_found_reply: 'Sorry, we could not find an account linked to this number. Please contact the management office.',
  },
};

export async function getSetting(key) {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', [key]);
  return { ...DEFAULTS[key], ...(rows[0]?.value ?? {}) };
}

export async function getAllSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, { ...DEFAULTS[k], ...(saved[k] ?? {}) }]));
}

export async function saveSetting(key, value, adminId = null, client = null) {
  const q = client ? client.query.bind(client) : query;
  await q(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, JSON.stringify(value), adminId]);
}
