import { config } from '../config.js';

/** "WhatsApp Number " -> "whatsapp_number" */
export function normalizeHeader(h) {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Accepted spreadsheet headers for each built-in field (after normalizeHeader).
export const HEADER_ALIASES = {
  name: ['name', 'full_name', 'contact_name', 'customer_name', 'client_name', 'first_name', 'nama'],
  whatsapp: ['whatsapp', 'whatsapp_number', 'whatsapp_no', 'wa', 'wa_number', 'phone', 'phone_number', 'mobile', 'mobile_number', 'contact_number', 'cellphone'],
  email: ['email', 'email_address', 'e_mail', 'mail'],
  status: ['status', 'status_type', 'type', 'category', 'segment'],
  amount: ['amount', 'value', 'balance', 'amount_due', 'total', 'number', 'points', 'credits'],
};

/** Map built-in field -> column key present in the sheet. */
export function detectColumns(columnKeys) {
  const found = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    found[field] = aliases.find((a) => columnKeys.includes(a)) ?? null;
  }
  return found;
}

/**
 * Normalize a phone number to WhatsApp format: international digits, no '+'.
 * Returns null when the value can't be a valid number.
 */
export function normalizePhone(raw, defaultCountryCode = config.defaultCountryCode) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Spreadsheets often turn numbers into floats/scientific notation
  if (/^\d+(\.0+)?$/.test(s)) s = s.replace(/\.0+$/, '');
  if (/^\d(\.\d+)?e\+\d+$/i.test(s)) s = BigInt(Math.round(Number(s))).toString();
  const hasPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (!hasPlus) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0') && defaultCountryCode) digits = defaultCountryCode + digits.slice(1);
    else if (defaultCountryCode && digits.length <= 10 && !digits.startsWith(defaultCountryCode)) digits = defaultCountryCode + digits;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  return EMAIL_RE.test(s) ? s : null;
}

/** "PHP 1,234.50" -> 1234.5 ; returns null when not numeric */
export function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return null;
  // "1.234,56" (EU) vs "1,234.56" (US): the last separator is the decimal one
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot && s.length - lastComma - 1 !== 3) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function normalizeStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return s || null;
}

export function formatAmount(n) {
  if (n === null || n === undefined) return '';
  const opts = { minimumFractionDigits: config.amountDecimals, maximumFractionDigits: config.amountDecimals };
  if (config.amountCurrency) Object.assign(opts, { style: 'currency', currency: config.amountCurrency });
  return new Intl.NumberFormat(config.amountLocale, opts).format(n);
}
