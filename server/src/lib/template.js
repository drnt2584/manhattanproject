import { formatAmount, parseAmount } from './normalize.js';
import { todayIso, daysBetween, formatDateLong } from './dates.js';

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Variables available to templates for one contact. */
export function contactVariables(contact, today = todayIso()) {
  const vars = {};
  for (const [k, v] of Object.entries(contact.fields || {})) {
    vars[k] = v === null || v === undefined ? '' : String(v);
  }
  vars.name = contact.name ?? '';
  vars.first_name = (contact.name ?? '').trim().split(/\s+/)[0] ?? '';
  vars.status = contact.fields?.status ?? contact.status ?? '';
  vars.amount = contact.amount === null || contact.amount === undefined ? '' : String(contact.amount);
  vars.amount_formatted = formatAmount(contact.amount);
  vars.email = contact.email ?? '';
  vars.whatsapp = contact.whatsapp ?? '';

  // Every numeric column also gets a currency-formatted twin: {{previous_unpaid_formatted}}
  for (const [k, v] of Object.entries(contact.fields || {})) {
    const n = parseAmount(v);
    if (n !== null && vars[`${k}_formatted`] === undefined) vars[`${k}_formatted`] = formatAmount(n);
  }
  // A blank "previous unpaid" cell means nothing is owed from earlier bills
  const hasPrev = contact.fields && Object.hasOwn(contact.fields, 'previous_unpaid');
  const prev = hasPrev ? (parseAmount(contact.fields.previous_unpaid) ?? 0) : null;
  if (hasPrev) {
    vars.previous_unpaid = String(prev);
    vars.previous_unpaid_formatted = formatAmount(prev);
  }
  if (contact.amount !== null && contact.amount !== undefined) {
    const total = Math.round(((contact.amount ?? 0) + (prev ?? 0)) * 100) / 100;
    vars.total_due = String(total);
    vars.total_due_formatted = formatAmount(total);
  }

  if (contact.due_date) {
    const days = daysBetween(contact.due_date, today);
    vars.due_date_formatted = formatDateLong(contact.due_date);
    vars.days_overdue = String(Math.max(0, days));
    vars.days_until_due = String(Math.max(0, -days));
    vars.due_status = days > 0 ? `overdue by ${days} day${days === 1 ? '' : 's'}`
      : days === 0 ? 'due today' : `due in ${-days} day${days === -1 ? '' : 's'}`;
  }
  return vars;
}

export function templateVariables(text) {
  return [...new Set([...String(text ?? '').matchAll(VAR_RE)].map((m) => m[1].toLowerCase()))];
}

/**
 * Render "{{name}}"-style placeholders. Missing or empty values are reported
 * rather than silently blanked so we never send "you owe ." to anyone.
 */
export function render(text, vars) {
  const missing = new Set();
  const out = String(text ?? '').replace(VAR_RE, (_, key) => {
    const v = vars[key.toLowerCase()];
    if (v === undefined || v === null || v === '') {
      missing.add(key.toLowerCase());
      return '';
    }
    return v;
  });
  return { text: out, missing: [...missing] };
}

export function textToHtml(text) {
  const esc = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2933">${esc.replace(/\r?\n/g, '<br>')}</div>`;
}
