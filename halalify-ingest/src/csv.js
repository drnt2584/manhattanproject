'use strict';

const fs = require('fs');

// Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF, UTF-8 BOM).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Reads the input CSV. Column A = Comp_code, Column B = URL. Header row skipped.
 * Returns { rows: [{ line, company_code, source_url }], invalid: [{ line, company_code, url, reason }] }
 */
function readInputCsv(filePath) {
  const all = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const rows = [];
  const invalid = [];
  all.slice(1).forEach((cols, idx) => {
    const line = idx + 2;
    const company_code = (cols[0] || '').trim();
    const source_url = (cols[1] || '').trim();
    if (!company_code && !source_url) return; // blank line
    if (!company_code) { invalid.push({ line, company_code: null, url: source_url || null, reason: 'missing Comp_code in CSV' }); return; }
    if (!/^https?:\/\//i.test(source_url)) { invalid.push({ line, company_code, url: source_url || null, reason: 'missing or invalid URL in CSV' }); return; }
    rows.push({ line, company_code, source_url });
  });
  return { rows, invalid };
}

module.exports = { parseCsv, readInputCsv };
