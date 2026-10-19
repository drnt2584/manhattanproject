'use strict';

// Parses a page snapshot ({ tables, text }) from scrape.js into raw company fields.
// Label matching is tolerant of colons, case, extra whitespace and label variants.

const LABELS = [
  { key: 'name', re: /^(company\s+)?name$/ },
  { key: 'address', re: /^(company\s+)?address$/ },
  { key: 'state', re: /^state$/ },
  { key: 'phone_no', re: /^(phone|tel|telephone)(\s*no\.?)?$/ },
  { key: 'fax_no', re: /^fax(\s*no\.?)?$/ },
  { key: 'email', re: /^e-?\s?mail(\s+address)?$/ },
  { key: 'website', re: /^(website|web\s*site|url|homepage)$/ },
  { key: 'reference_no', re: /^ref(erence)?\.?(\s*no\.?)?$/ },
  { key: 'officer', re: /^officers?(\s+in\s+charge)?$/ },
];
const MULTI = new Set(['reference_no', 'officer']);

const clean = (s) => String(s == null ? '' : s).replace(/ /g, ' ');
const normLabel = (s) => clean(s).replace(/[:：]\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

function matchLabel(cell) {
  const l = normLabel(cell);
  if (!l || l.length > 40) return null;
  const hit = LABELS.find((x) => x.re.test(l));
  return hit ? hit.key : null;
}

// "Name : ABC SDN BHD" in a single cell or text line
function matchInline(text) {
  // Cells that wrap whole nested tables are layout containers, not fields
  if (clean(text).length > 600 || clean(text).split(/\n/).length > 8) return null;
  const m = clean(text).match(/^\s*([A-Za-z][A-Za-z .\-]{1,30}?)\s*[:：]\s*([\s\S]*)$/);
  if (!m) return null;
  const key = matchLabel(m[1]);
  return key ? { key, value: m[2] } : null;
}

const isSeparator = (cell) => /^\s*[:：]?\s*$/.test(clean(cell));

function addValue(out, key, value) {
  const v = clean(value);
  if (MULTI.has(key)) {
    v.split(/\r?\n/).forEach((part) => out[key].push(part));
  } else if (out[key] == null && v.trim() !== '') {
    out[key] = v;
  }
}

function extractCompanyInfo(tables, text) {
  const out = { name: null, address: null, state: null, phone_no: null, fax_no: null, email: null, website: null, reference_no: [], officer: [] };

  for (const table of tables) {
    let lastMulti = null;
    for (const row of table) {
      let matched = false;
      for (let i = 0; i < row.length; i++) {
        let key = matchLabel(row[i]);
        let value;
        if (key) {
          let j = i + 1;
          while (j < row.length && isSeparator(row[j])) j++;
          value = j < row.length ? row[j] : '';
          // a cell containing only a label followed by a value cell — skip consumed cells
          i = j;
        } else {
          const inline = matchInline(row[i]);
          if (!inline) continue;
          key = inline.key;
          value = inline.value;
        }
        matched = true;
        addValue(out, key, value);
        lastMulti = MULTI.has(key) ? key : null;
      }
      // continuation rows (empty label cell) for multi-value fields, e.g. extra reference numbers
      if (!matched && lastMulti && row.length >= 2 && isSeparator(row[0])) {
        const vals = row.filter((c) => !isSeparator(c));
        if (vals.length === 1) addValue(out, lastMulti, vals[0]);
        else lastMulti = null;
      } else if (!matched) {
        lastMulti = null;
      }
    }
  }

  // Fallback for non-table layouts: "Label : value" text lines
  if (!out.name && text) {
    for (const line of clean(text).split(/\r?\n/)) {
      const inline = matchInline(line);
      if (inline) addValue(out, inline.key, inline.value);
    }
  }
  return out;
}

const HEADER_COLS = {
  no: /^(no\.?|bil\.?|#)$/,
  product: /^(product|menu|product\s*\/\s*menu|product\s*name)/,
  brand: /^(brand|jenama)/,
  expiry_date: /(expiry|expired|tarikh\s*tamat|valid\s*until)/,
};

function headerMap(row) {
  const map = {};
  row.forEach((cell, idx) => {
    const l = normLabel(cell);
    if (l.length > 40) return;
    for (const [k, re] of Object.entries(HEADER_COLS)) {
      if (map[k] == null && re.test(l)) { map[k] = idx; break; }
    }
  });
  return map.product != null && map.expiry_date != null ? map : null;
}

/** Locates the Product/Menu List table(s) and returns raw rows { no, product, brand, expiry_date }. */
function extractProducts(tables) {
  const rows = [];
  let pendingMap = null; // header found in a table with no data rows: data is in the next table

  for (const table of tables) {
    let map = pendingMap;
    let start = 0;
    if (!map) {
      const h = table.findIndex((r) => headerMap(r));
      if (h === -1) continue;
      map = headerMap(table[h]);
      start = h + 1;
    }
    let found = 0;
    for (let r = start; r < table.length; r++) {
      const row = table[r];
      if (headerMap(row)) continue; // repeated header (paged tables)
      const product = row[map.product];
      if (product == null || clean(product).trim() === '') continue;
      rows.push({
        no: map.no != null ? row[map.no] : null,
        product,
        brand: map.brand != null ? row[map.brand] : null,
        expiry_date: row[map.expiry_date],
      });
      found++;
    }
    pendingMap = found === 0 && !pendingMap ? map : null;
  }
  return rows;
}

function extractFromSnapshot(snapshot) {
  const tables = (snapshot && snapshot.tables) || [];
  const text = (snapshot && snapshot.text) || '';
  // Ignore outer layout tables that merely wrap the inner ones: a row whose single
  // cell contains a whole nested table produces huge multi-line cells; label matching
  // already rejects long cells, so no special casing is needed here.
  const info = extractCompanyInfo(tables, text);
  const products = extractProducts(tables);
  return { ...info, products, hasProductSection: /product\s*\/\s*menu\s*list/i.test(text) || products.length > 0 };
}

module.exports = { extractFromSnapshot, extractCompanyInfo, extractProducts };
