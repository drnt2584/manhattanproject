'use strict';

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/** companies_json.zip: json/*.json + master JSONL + all reports. */
function createZip(outDir, zipName, reportFiles) {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(outDir, zipName);
    const tmp = zipPath + '.tmp';
    const output = fs.createWriteStream(tmp);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => { fs.renameSync(tmp, zipPath); resolve(zipPath); });
    archive.on('error', reject);
    archive.on('warning', (e) => { if (e.code !== 'ENOENT') reject(e); });
    archive.pipe(output);
    archive.directory(path.join(outDir, 'json'), 'json', (entry) => (entry.name.endsWith('.json') ? entry : false));
    for (const f of ['companies_master.jsonl', ...reportFiles]) {
      const p = path.join(outDir, f);
      if (fs.existsSync(p)) archive.file(p, { name: f });
    }
    archive.finalize();
  });
}

module.exports = { createZip };
