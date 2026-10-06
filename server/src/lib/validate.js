import { HttpError } from './errors.js';

export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    throw new HttpError(400, msg);
  }
  return r.data;
}

export function pageParams(q, max = 200) {
  const limit = Math.min(max, Math.max(1, Number.parseInt(q.limit, 10) || 50));
  const offset = Math.max(0, Number.parseInt(q.offset, 10) || 0);
  return { limit, offset };
}

export function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralize spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
