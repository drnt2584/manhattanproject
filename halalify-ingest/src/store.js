'use strict';

const fs = require('fs');
const path = require('path');
const { fileNameFor } = require('./normalize');

/**
 * Filesystem store for incremental updates.
 *   output/json/{code}_{name}.json      current version per company
 *   output/history/{code}/{date}.json    superseded versions
 *   output/companies_master.jsonl        append-only log of new/updated records
 */
class Store {
  constructor(outDir) {
    this.outDir = outDir;
    this.jsonDir = path.join(outDir, 'json');
    this.historyDir = path.join(outDir, 'history');
    this.jsonlPath = path.join(outDir, 'companies_master.jsonl');
    fs.mkdirSync(this.jsonDir, { recursive: true });
    fs.mkdirSync(this.historyDir, { recursive: true });
    this.index = new Map(); // company_code -> filename
    for (const f of fs.readdirSync(this.jsonDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(this.jsonDir, f), 'utf8'));
        if (rec && rec.company_code) this.index.set(String(rec.company_code), f);
      } catch { /* unreadable file: treated as absent, will be replaced */ }
    }
    this.jsonlStream = fs.createWriteStream(this.jsonlPath, { flags: 'a' });
  }

  loadExisting(code) {
    const f = this.index.get(code);
    if (!f) return null;
    try { return { file: f, record: JSON.parse(fs.readFileSync(path.join(this.jsonDir, f), 'utf8')) }; } catch { return null; }
  }

  archive(code, file, record) {
    const dir = path.join(this.historyDir, code.replace(/[^A-Za-z0-9._-]+/g, '_'));
    fs.mkdirSync(dir, { recursive: true });
    const date = String(record.scraped_at || new Date().toISOString()).slice(0, 10);
    let target = path.join(dir, `${date}.json`);
    // same-day re-version: keep both
    if (fs.existsSync(target)) target = path.join(dir, `${date}T${String(record.scraped_at || '').slice(11, 19).replace(/:/g, '') || Date.now()}.json`);
    if (fs.existsSync(target)) target = path.join(dir, `${date}_${Date.now()}.json`);
    fs.renameSync(path.join(this.jsonDir, file), target);
  }

  writeAtomic(file, record) {
    const p = path.join(this.jsonDir, file);
    fs.writeFileSync(p + '.tmp', JSON.stringify(record, null, 2));
    fs.renameSync(p + '.tmp', p);
  }

  /** Applies incremental logic; sets record.change_status; returns 'new' | 'updated' | 'unchanged'. */
  upsert(record) {
    const code = String(record.company_code);
    const existing = this.loadExisting(code);
    if (!existing) {
      record.change_status = 'new';
    } else if (existing.record.page_hash === record.page_hash) {
      record.change_status = 'unchanged';
      return 'unchanged'; // existing JSON is left untouched
    } else {
      record.change_status = 'updated';
      this.archive(code, existing.file, existing.record);
    }
    const file = fileNameFor(record);
    this.writeAtomic(file, record);
    this.index.set(code, file);
    this.jsonlStream.write(JSON.stringify(record) + '\n');
    return record.change_status;
  }

  allCurrentRecords() {
    const out = [];
    for (const f of this.index.values()) {
      try { out.push(JSON.parse(fs.readFileSync(path.join(this.jsonDir, f), 'utf8'))); } catch { /* skip */ }
    }
    return out;
  }

  close() {
    return new Promise((resolve) => this.jsonlStream.end(resolve));
  }
}

module.exports = { Store };
