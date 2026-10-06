import { formatAmount } from './normalize.js';

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Variables available to templates for one contact. */
export function contactVariables(contact) {
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
