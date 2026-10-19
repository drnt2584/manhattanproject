'use strict';

// End-to-end test: serves fixtures over local HTTP, runs the pipeline three times
// (initial -> unchanged -> one page changed) and checks the outputs.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { run } = require('../src/index');
const { normalizeDate, jakimStatus, fileNameFor } = require('../src/normalize');

const FIX = path.join(__dirname, 'fixtures');
const TMP = path.join(__dirname, 'tmp');
const pages = {};

function unit() {
  assert.strictEqual(normalizeDate('15/03/2028'), '2028-03-15');
  assert.strictEqual(normalizeDate('5-3-2028'), '2028-03-05');
  assert.strictEqual(normalizeDate('15 Mar 2028'), '2028-03-15');
  assert.strictEqual(normalizeDate('31/02/2027'), '31/02/2027'); // invalid -> original
  assert.strictEqual(normalizeDate(''), null);
  assert.deepStrictEqual(jakimStatus([{ expiry_date: '2026-10-19' }], '2026-10-19').jakim_status, 'active');
  assert.deepStrictEqual(jakimStatus([{ expiry_date: '2026-10-18' }], '2026-10-19').jakim_status, 'expired');
  assert.deepStrictEqual(jakimStatus([{ expiry_date: 'n/a' }], '2026-10-19').jakim_status, 'unknown');
  assert.strictEqual(fileNameFor({ company_code: '12345', name: 'Tanjung Emas Trading Sdn. Bhd.' }), '12345_tanjung_emas_trading_sdn_bhd.json');
  console.log('unit tests passed');
}

async function e2e() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  for (const f of fs.readdirSync(FIX)) pages['/' + f] = fs.readFileSync(path.join(FIX, f), 'utf8');

  const server = http.createServer((req, res) => {
    const body = pages[req.url.split('?')[0]];
    if (!body) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const csv = path.join(TMP, 'input.csv');
  fs.writeFileSync(csv, '﻿Comp_code,URL\r\n' + [
    `A1,${base}/company_a.html?comp_code=A1`,
    `B2,${base}/company_b.html`,
    `C3,${base}/no_record.html`,
    `D4,${base}/missing.html`,
    `A1,${base}/company_a.html?dup=1`,
    `,${base}/company_b.html`,
  ].join('\r\n') + '\r\n');
  const out = path.join(TMP, 'output');
  const quiet = () => {};
  const fixedNow = () => new Date('2026-10-19T03:45:23Z');

  try {
    // Run 1: everything new
    let r = await run({ csv, out, concurrency: 5, offset: 0, limit: Infinity }, { log: quiet, now: fixedNow });
    assert.strictEqual(r.summary.total_urls, 5); // duplicate A1 processed once
    assert.strictEqual(r.summary.successful_extractions, 2);
    assert.strictEqual(r.summary.new_records, 2);
    assert.strictEqual(r.summary.failed_extractions, 3); // C3 invalid, D4 404, CSV row w/o code

    const a = JSON.parse(fs.readFileSync(path.join(out, 'json', 'A1_tanjung_emas_trading_sdn_bhd.json'), 'utf8'));
    assert.strictEqual(a.name, 'TANJUNG EMAS Trading SDN BHD');
    assert.strictEqual(a.address, 'NO 12, JALAN MAJU 3, TAMAN PERINDUSTRIAN, 81700 PASIR GUDANG');
    assert.strictEqual(a.state, 'JOHOR');
    assert.strictEqual(a.email, 'sales@tanjungemas.com.my');
    assert.strictEqual(a.website, null);
    assert.deepStrictEqual(a.reference_no, ['JAKIM.700-2/3/1 022-08/2011', 'JAKIM.700-2/3/8 022-08/2011']);
    assert.deepStrictEqual(a.officers, ['PUAN AMINAH BINTI ALI', 'ENCIK AHMAD BIN OMAR']);
    assert.strictEqual(a.reference_count, 2);
    assert.strictEqual(a.officer_count, 2);
    assert.strictEqual(a.product_menu_list.length, 4); // duplicate BAWANG GORENG removed
    assert.deepStrictEqual(a.product_menu_list[1].brand, ['BELACAN CAP TET', 'BELACAN CAP MJ', 'BELACAN CAP WALFOOD']);
    assert.strictEqual(a.product_menu_list[3].expiry_date, '31/02/2027'); // unparseable kept as-is
    assert.strictEqual(a.product_count, 4);
    assert.strictEqual(a.latest_expiry_date, '2028-03-15');
    assert.strictEqual(a.jakim_status, 'active');
    assert.strictEqual(a.change_status, 'new');
    assert.strictEqual(a.scraped_at, '2026-10-19T03:45:23Z');
    assert.match(a.page_hash, /^sha256:[0-9a-f]{64}$/);

    const b = JSON.parse(fs.readFileSync(path.join(out, 'json', 'B2_kilang_lama_enterprise.json'), 'utf8'));
    assert.strictEqual(b.jakim_status, 'expired');
    assert.strictEqual(b.email, null);
    assert.strictEqual(b.phone_no, null);

    const errs = JSON.parse(fs.readFileSync(path.join(out, 'processing_errors.json'), 'utf8'));
    assert.ok(errs.find((e) => e.company_code === 'C3' && /missing name/.test(e.reason)));
    assert.ok(errs.find((e) => e.company_code === 'D4' && e.reason === 'http_404'));

    const q = JSON.parse(fs.readFileSync(path.join(out, 'quality_check.json'), 'utf8'));
    assert.deepStrictEqual(q.records_missing_phone, ['B2']);
    assert.deepStrictEqual(q.records_missing_email, ['B2']);
    assert.strictEqual(q.duplicate_company_codes.in_csv[0].company_code, 'A1');
    assert.deepStrictEqual(q.duplicate_reference_numbers[0].company_codes.sort(), ['A1', 'B2']);
    assert.strictEqual(q.invalid_emails[0].value, 'not-an-email');

    const jsonl = () => fs.readFileSync(path.join(out, 'companies_master.jsonl'), 'utf8').trim().split('\n');
    assert.strictEqual(jsonl().length, 2);
    assert.ok(fs.existsSync(path.join(out, 'companies_json.zip')));

    // Run 2: no change -> unchanged, nothing appended
    r = await run({ csv, out, concurrency: 5, offset: 0, limit: Infinity }, { log: quiet, now: () => new Date('2026-10-20T01:00:00Z') });
    assert.strictEqual(r.summary.new_records, 0);
    assert.strictEqual(r.summary.updated_records, 0);
    assert.strictEqual(r.summary.unchanged_records, 2);
    assert.strictEqual(jsonl().length, 2);

    // Run 3: company A page changes -> updated, old version archived
    pages['/company_a.html'] = pages['/company_a.html'].replace('07-2511234', '07-2519999');
    r = await run({ csv, out, concurrency: 5, offset: 0, limit: Infinity }, { log: quiet, now: () => new Date('2026-12-12T01:00:00Z') });
    assert.strictEqual(r.summary.updated_records, 1);
    assert.strictEqual(r.delta.updated_records, 1);
    assert.strictEqual(r.delta.expired_companies, 1);
    assert.ok(fs.existsSync(path.join(out, 'history', 'A1', '2026-10-19.json')));
    const a3 = JSON.parse(fs.readFileSync(path.join(out, 'json', 'A1_tanjung_emas_trading_sdn_bhd.json'), 'utf8'));
    assert.strictEqual(a3.change_status, 'updated');
    assert.strictEqual(a3.phone_no, '07-2519999');
    assert.strictEqual(jsonl().length, 3);
    console.log('e2e tests passed');
  } finally {
    server.close();
  }
}

unit();
e2e().catch((e) => { console.error(e); process.exit(1); });
