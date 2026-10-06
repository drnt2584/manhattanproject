import { createRequire } from 'node:module';
import { parse as parseCsv } from 'csv-parse/sync';
import { HttpError } from '../lib/errors.js';
import { parseDate } from '../lib/dates.js';
import {
  OPTIONAL_FIELDS, normalizeHeader, detectColumns, normalizePhone, normalizeEmail, parseAmount, normalizeStatus,
} from '../lib/normalize.js';

const require = createRequire(import.meta.url);
let XLSX = null;
function loadXlsx() {
  if (XLSX) return XLSX;
  try {
    XLSX = require('xlsx');
    return XLSX;
  } catch {
    throw new HttpError(400, 'Excel (.xls/.xlsx) support is not installed on this server. Run "npm install" in /server with internet access, or upload a CSV.');
  }
}

/** Parse an uploaded file buffer into an array of row objects (raw header -> value). */
export function parseFile(buffer, filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'csv' || ext === 'txt') return parseCsvBuffer(buffer);
  if (['xls', 'xlsx', 'xlsm', 'ods'].includes(ext)) {
    const X = loadXlsx();
    const wb = X.read(buffer, { type: 'buffer', cellDates: true, dense: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new HttpError(400, 'The workbook has no sheets');
    return X.utils.sheet_to_json(sheet, { defval: '', raw: true });
  }
  throw new HttpError(400, 'Unsupported file type. Upload a .csv, .xls or .xlsx file.');
}

export function parseCsvBuffer(buffer) {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  try {
    return parseCsv(text, { columns: true, skip_empty_lines: true, trim: true, delimiter, relax_column_count: true });
  } catch (err) {
    throw new HttpError(400, `Could not read CSV: ${err.message}`);
  }
}

/**
 * Turn raw rows into contacts with normalized built-in fields and warnings.
 * Required columns: name, status, amount and at least one of whatsapp/email.
 */
export function rowsToContacts(rows) {
  if (!rows.length) throw new HttpError(400, 'The sheet has no data rows');
  const rawHeaders = Object.keys(rows[0]);
  const columns = rawHeaders.map((h) => ({ header: h, key: normalizeHeader(h) })).filter((c) => c.key);
  const keys = columns.map((c) => c.key);
  const map = detectColumns(keys);

  const missing = [];
  if (!map.name) missing.push('name');
  if (!map.status) missing.push('status');
  if (!map.whatsapp && !map.email) missing.push('whatsapp and/or email');
  if (missing.length) {
    throw new HttpError(400, `Missing required column(s): ${missing.join(', ')}. Found: ${rawHeaders.join(', ')}`);
  }

  const contacts = [];
  rows.forEach((row, i) => {
    const fields = {};
    for (const c of columns) {
      let v = row[c.header];
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      fields[c.key] = v === null || v === undefined ? '' : String(v).trim();
    }
    if (Object.values(fields).every((v) => v === '')) return; // blank line
    // Expose optional columns under canonical names ({{unit}}, {{previous_unpaid}}, {{due_date}})
    for (const f of OPTIONAL_FIELDS) if (map[f] && map[f] !== f && fields[f] === undefined) fields[f] = fields[map[f]];
    const warnings = [];
    const name = map.name ? fields[map.name] || null : null;
    const rawPhone = map.whatsapp ? fields[map.whatsapp] : '';
    const rawEmail = map.email ? fields[map.email] : '';
    const whatsapp = normalizePhone(rawPhone);
    const email = normalizeEmail(rawEmail);
    const status = map.status ? normalizeStatus(fields[map.status]) : null;
    const amount = map.amount ? parseAmount(fields[map.amount]) : null;
    const due_date = map.due_date ? parseDate(fields[map.due_date]) : null;
    if (!name) warnings.push('missing name');
    if (map.due_date && fields[map.due_date] && !due_date) warnings.push(`unreadable due date "${fields[map.due_date]}"`);
    if (map.previous_unpaid && fields[map.previous_unpaid] && parseAmount(fields[map.previous_unpaid]) === null) warnings.push('previous unpaid is not a number');
    if (!status) warnings.push('missing status');
    if (map.amount && amount === null) warnings.push('amount is not a number');
    if (rawPhone && !whatsapp) warnings.push(`invalid WhatsApp number "${rawPhone}"`);
    if (rawEmail && !email) warnings.push(`invalid email "${rawEmail}"`);
    if (!whatsapp && !email) warnings.push('no WhatsApp number or email');
    contacts.push({ row_number: i + 2, name, whatsapp, email, status, amount, due_date, fields, warnings });
  });
  if (!contacts.length) throw new HttpError(400, 'The sheet has no data rows');
  return { contacts, columns, mapping: map };
}
