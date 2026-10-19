#!/usr/bin/env node
'use strict';

/**
 * Halalify JAKIM ingestion pipeline.
 *
 *   node src/index.js --csv input/Compcode.csv --out output [--concurrency 5] [--offset 0] [--limit N]
 *
 * Re-running is safe: unchanged pages are skipped by page_hash, changed pages are
 * versioned into output/history/{company_code}/.
 */

const fs = require('fs');
const path = require('path');
const { readInputCsv } = require('./csv');
const { launchBrowser, scrapeUrl } = require('./scrape');
const { extractFromSnapshot } = require('./extract');
const { buildRecord, validateRecord } = require('./normalize');
const { Store } = require('./store');
const { qualityCheck, deltaReport } = require('./reports');
const { createZip } = require('./zip');

const ZIP_NAME = 'companies_json.zip';
const REPORT_FILES = ['extraction_summary.json', 'delta_report.json', 'quality_check.json', 'processing_errors.json'];
const isoNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function parseArgs(argv) {
  const args = { csv: 'input/Compcode.csv', out: 'output', concurrency: 5, offset: 0, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--csv') args.csv = next();
    else if (a === '--out') args.out = next();
    else if (a === '--concurrency') args.concurrency = Math.max(1, parseInt(next(), 10));
    else if (a === '--offset') args.offset = Math.max(0, parseInt(next(), 10));
    else if (a === '--limit') args.limit = Math.max(1, parseInt(next(), 10));
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node src/index.js --csv <file.csv> --out <dir> [--concurrency 5] [--offset 0] [--limit N]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const writeJson = (dir, name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2));

async function run(args, { log = console.log, now = () => new Date() } = {}) {
  const startedAt = isoNow();
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const { rows: allRows, invalid: csvInvalid } = readInputCsv(args.csv);
  // Duplicate Comp_codes are processed once (first occurrence) so two workers never
  // race on the same company file; duplicates are listed in quality_check.json.
  const seenCodes = new Set();
  const rows = allRows.filter((r) => !seenCodes.has(r.company_code) && seenCodes.add(r.company_code))
    .slice(args.offset, args.offset + args.limit);
  const store = new Store(outDir);

  const errors = csvInvalid.map((e) => ({ company_code: e.company_code, url: e.url, reason: e.reason, csv_line: e.line }));
  const invalidEmails = [];
  const runRecords = [];
  const counts = { new: 0, updated: 0, unchanged: 0, newCodes: [], updatedCodes: [] };
  let success = 0;
  let failed = csvInvalid.length;
  let done = 0;

  log(`Processing ${rows.length} URLs (CSV rows: ${allRows.length}, concurrency: ${args.concurrency}) -> ${outDir}`);

  const browser = await launchBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 HalalifyIngest/1.0',
    ignoreHTTPSErrors: true,
  });

  let stopping = false;
  process.once('SIGINT', () => { stopping = true; log('SIGINT received: finishing in-flight pages, then writing reports...'); });

  async function processRow(row) {
    const res = await scrapeUrl(context, row.source_url, log);
    if (!res.ok) {
      failed++;
      errors.push({ company_code: row.company_code, url: row.source_url, reason: res.reason });
      return;
    }
    const raw = extractFromSnapshot(res.snapshot);
    const { record, invalid_email } = buildRecord(row, raw, { now: now() });
    const missing = validateRecord(record);
    if (missing.length) {
      // keep the raw page structure so layout changes on the JAKIM site can be diagnosed
      const debugDir = path.join(outDir, 'debug');
      fs.mkdirSync(debugDir, { recursive: true });
      fs.writeFileSync(path.join(debugDir, `${row.company_code.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`), JSON.stringify(res.snapshot, null, 2));
      failed++;
      errors.push({ company_code: row.company_code, url: row.source_url, reason: `invalid record: missing ${missing.join(', ')}` });
      return;
    }
    if (invalid_email) invalidEmails.push({ company_code: record.company_code, value: invalid_email });
    const status = store.upsert(record);
    counts[status]++;
    if (status === 'new') counts.newCodes.push(record.company_code);
    if (status === 'updated') counts.updatedCodes.push(record.company_code);
    success++;
    runRecords.push({ company_code: record.company_code, jakim_status: record.jakim_status });
  }

  let cursor = 0;
  async function worker() {
    while (!stopping && cursor < rows.length) {
      const row = rows[cursor++];
      try {
        await processRow(row);
      } catch (err) {
        // never let one URL kill the job
        failed++;
        errors.push({ company_code: row.company_code, url: row.source_url, reason: `unexpected: ${String(err && err.message || err).split('\n')[0]}` });
      }
      done++;
      if (done % 25 === 0 || done === rows.length) {
        log(`[${done}/${rows.length}] ok=${success} failed=${failed} new=${counts.new} updated=${counts.updated} unchanged=${counts.unchanged}`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(args.concurrency, rows.length || 1) }, worker));
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    await store.close();
  }

  const allRecords = store.allCurrentRecords();
  writeJson(outDir, 'processing_errors.json', errors);
  writeJson(outDir, 'quality_check.json', qualityCheck(allRecords, allRows, invalidEmails));
  const delta = deltaReport(counts, runRecords);
  writeJson(outDir, 'delta_report.json', delta);

  const summary = {
    total_urls: rows.length + csvInvalid.length,
    successful_extractions: success,
    failed_extractions: failed,
    new_records: counts.new,
    updated_records: counts.updated,
    unchanged_records: counts.unchanged,
    generated_json_files: counts.new + counts.updated,
    total_json_files_on_disk: allRecords.length,
    generated_jsonl_file: fs.existsSync(store.jsonlPath),
    started_at: startedAt,
    completed_at: isoNow(),
    interrupted: stopping,
    zip_file: ZIP_NAME,
  };
  writeJson(outDir, 'extraction_summary.json', summary);
  const zipPath = await createZip(outDir, ZIP_NAME, REPORT_FILES);

  return { summary, delta, zipPath };
}

if (require.main === module) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  run(args)
    .then(({ summary, delta, zipPath }) => {
      console.log('\n================ RESULT ================');
      console.log(`Total URLs processed : ${summary.total_urls}`);
      console.log(`Successful extractions: ${summary.successful_extractions}`);
      console.log(`Failed extractions   : ${summary.failed_extractions}`);
      console.log(`New records          : ${summary.new_records}`);
      console.log(`Updated records      : ${summary.updated_records}`);
      console.log(`Unchanged records    : ${summary.unchanged_records}`);
      console.log(`Active companies     : ${delta.active_companies}`);
      console.log(`Expired companies    : ${delta.expired_companies}`);
      console.log(`ZIP file             : ${zipPath}`);
    })
    .catch((err) => { console.error('Fatal:', err); process.exit(1); });
}

module.exports = { run, parseArgs };
