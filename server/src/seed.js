// Load starter templates + automation texts:  npm run seed -- seeds/manhattan-residence.json [--force]
// Existing templates with the same status are kept unless --force is given.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool, tx } from './db.js';
import { migrate } from './migrate.js';
import { audit } from './services/audit.js';
import { saveSetting } from './services/settings.js';

export async function seed(data, { force = false } = {}) {
  const result = { created: [], updated: [], kept: [], settings: [] };
  await tx(async (c) => {
    for (const t of data.templates ?? []) {
      const { rows: [existing] } = await c.query('SELECT id FROM templates WHERE status_key = $1', [t.status_key]);
      const vals = [t.status_key, t.label ?? '', t.wa_enabled ?? true, t.wa_body ?? '', t.wa_template_name ?? null, t.wa_language ?? 'en',
        JSON.stringify(t.wa_params ?? []), t.email_enabled ?? true, t.email_subject ?? '', t.email_body ?? ''];
      if (!existing) {
        await c.query(`INSERT INTO templates (status_key, label, wa_enabled, wa_body, wa_template_name, wa_language, wa_params, email_enabled, email_subject, email_body)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, vals);
        result.created.push(t.status_key);
      } else if (force) {
        await c.query(`UPDATE templates SET label=$2, wa_enabled=$3, wa_body=$4, wa_template_name=$5, wa_language=$6, wa_params=$7,
                       email_enabled=$8, email_subject=$9, email_body=$10, updated_at=now() WHERE status_key=$1`, vals);
        result.updated.push(t.status_key);
      } else {
        result.kept.push(t.status_key);
      }
    }
    for (const [key, value] of Object.entries(data.settings ?? {})) {
      const { rowCount } = await c.query('SELECT 1 FROM settings WHERE key = $1', [key]);
      if (rowCount && !force) continue;
      await saveSetting(key, value, null, c);
      result.settings.push(key);
    }
    await audit({ event: 'seed_loaded', actor: 'system', details: result }, c);
  });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: npm run seed -- <file.json> [--force]');
    process.exit(1);
  }
  const data = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
  await migrate();
  const result = await seed(data, { force: process.argv.includes('--force') });
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}
