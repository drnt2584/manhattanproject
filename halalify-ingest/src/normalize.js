'use strict';

const crypto = require('crypto');

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  januari: 1, februari: 2, mac: 3, april: 4, mei: 5, julai: 7, ogos: 8, september: 9, oktober: 10, november: 11, disember: 12 };
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Trim, collapse whitespace, empty -> null. */
function ws(v) {
  if (v == null) return null;
  const s = String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  return s === '' || s === '-' ? null : s;
}

function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    const s = ws(v);
    if (s && !seen.has(s.toUpperCase())) { seen.add(s.toUpperCase()); out.push(s); }
  }
  return out;
}

function isValidYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const pad = (n) => String(n).padStart(2, '0');

/** dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, yyyy-mm-dd, "15 Mar 2028" -> "2028-03-15"; else original. */
function normalizeDate(raw) {
  const s = ws(raw);
  if (!s) return null;
  let y, m, d, mt;
  if ((mt = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) [d, m, y] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = s.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/))) [y, m, d] = [+mt[1], +mt[2], +mt[3]];
  else if ((mt = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]+)\.?[\s\-,]+(\d{4})$/))) {
    d = +mt[1]; m = MONTHS[mt[2].toLowerCase()]; y = +mt[3];
  }
  if (y && m && d && isValidYmd(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`;
  return s;
}
const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Brand cell may hold several brands (one per line or separated by ' / ' or ';'). */
function normalizeBrand(raw) {
  if (raw == null) return null;
  const parts = uniq(String(raw).split(/\r?\n|;|\s\/\s|\|/));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : parts;
}

function normalizeProducts(rawRows) {
  const seen = new Set();
  const out = [];
  rawRows.forEach((r, idx) => {
    const product = ws(r.product);
    if (!product) return;
    const brand = normalizeBrand(r.brand);
    const expiry_date = normalizeDate(r.expiry_date);
    const key = [product.toUpperCase(), JSON.stringify(Array.isArray(brand) ? brand.map((b) => b.toUpperCase()).sort() : (brand || '').toUpperCase()), expiry_date || ''].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const no = parseInt(ws(r.no), 10);
    out.push({ no: Number.isFinite(no) ? no : idx + 1, product, brand, expiry_date });
  });
  return out;
}

function todayIso(now = new Date()) {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

/** active: any valid expiry >= today; expired: all valid expiries < today; unknown: none valid. */
function jakimStatus(products, today) {
  const dates = products.map((p) => p.expiry_date).filter(isIsoDate);
  if (dates.length === 0) return { jakim_status: 'unknown', latest_expiry_date: null };
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  return { jakim_status: latest >= today ? 'active' : 'expired', latest_expiry_date: latest };
}

function normalizeEmail(raw) {
  const s = ws(raw);
  if (!s) return { email: null, invalid: null };
  // pages sometimes list several addresses; keep the first valid one
  const candidates = s.split(/[\s,;\/]+/).map((x) => x.replace(/^mailto:/i, '').toLowerCase()).filter(Boolean);
  const valid = candidates.find((c) => EMAIL_RE.test(c));
  return valid ? { email: valid, invalid: null } : { email: null, invalid: s };
}

/** Deterministic JSON (sorted keys) so the hash only changes when content changes. */
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

// Excluded from the hash: run metadata (scraped_at, page_hash, change_status) and
// jakim_status, which is derived from *today's* date and would otherwise flag a
// page as "updated" when only the calendar moved. Its inputs (expiry dates) are hashed.
const HASH_EXCLUDE = new Set(['scraped_at', 'page_hash', 'change_status', 'jakim_status']);
function pageHash(record) {
  const subset = {};
  for (const [k, v] of Object.entries(record)) if (!HASH_EXCLUDE.has(k)) subset[k] = v;
  return 'sha256:' + crypto.createHash('sha256').update(stableStringify(subset)).digest('hex');
}

/** Builds the output record (field order as specified) from CSV row + extracted raw fields. */
function buildRecord({ company_code, source_url }, raw, { now = new Date() } = {}) {
  const product_menu_list = normalizeProducts(raw.products || []);
  const { jakim_status, latest_expiry_date } = jakimStatus(product_menu_list, todayIso(now));
  const reference_no = uniq(raw.reference_no || []);
  const officers = uniq(raw.officer || []);
  const { email, invalid: invalid_email } = normalizeEmail(raw.email);
  const website = ws(raw.website);

  const record = {
    company_code,
    source_url,
    scraped_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    page_hash: null,
    change_status: null,
    jakim_status,
    latest_expiry_date,
    product_count: new Set(product_menu_list.map((p) => p.product.toUpperCase())).size,
    reference_count: reference_no.length,
    officer_count: officers.length,
    name: ws(raw.name),
    address: ws(raw.address),
    state: ws(raw.state),
    phone_no: ws(raw.phone_no),
    fax_no: ws(raw.fax_no),
    email,
    website: website && !/^(n\/?a|none|tiada)$/i.test(website) ? website : null,
    reference_no,
    officers,
    product_menu_list,
  };
  record.page_hash = pageHash(record);
  return { record, invalid_email };
}

function validateRecord(r) {
  const missing = [];
  if (!r.company_code) missing.push('company_code');
  if (!r.source_url) missing.push('source_url');
  if (!r.name) missing.push('name');
  if (!Array.isArray(r.product_menu_list)) missing.push('product_menu_list');
  return missing;
}

/** {company_code}_{company_name}.json — lowercase, underscores, safe characters only. */
function fileNameFor(r) {
  const slug = String(r.name || 'unknown')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'unknown';
  const code = String(r.company_code).replace(/[^A-Za-z0-9._-]+/g, '_');
  return `${code}_${slug}.json`;
}

module.exports = { ws, uniq, normalizeDate, normalizeBrand, normalizeProducts, jakimStatus, todayIso, normalizeEmail, stableStringify, pageHash, buildRecord, validateRecord, fileNameFor };
