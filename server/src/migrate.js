import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ file }, 'migration applied');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${err.message}`);
      }
    }
    await seedAdmin(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}

async function seedAdmin(client) {
  if (!config.adminEmail || !config.adminPassword) return;
  const email = config.adminEmail.toLowerCase();
  const exists = await client.query('SELECT 1 FROM admins WHERE email = $1', [email]);
  if (exists.rowCount) return;
  const hash = await bcrypt.hash(config.adminPassword, 12);
  await client.query('INSERT INTO admins (email, name, password_hash) VALUES ($1, $2, $3)', [email, 'Admin', hash]);
  logger.info({ email }, 'seeded admin account');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      logger.error({ err }, 'migration failed');
      process.exit(1);
    });
}
