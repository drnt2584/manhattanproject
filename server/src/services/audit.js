import crypto from 'node:crypto';
import { pool } from '../db.js';
import { canonicalJson } from '../lib/canonical.js';
import { logger } from '../logger.js';

const CHAIN_LOCK = 727002;
const FIELDS = ['ts', 'event', 'actor', 'run_id', 'channel', 'direction', 'contact_name', 'address', 'status', 'provider_message_id', 'error', 'details'];

export function hashEntry(entry, prevHash) {
  const body = {};
  for (const f of FIELDS) body[f] = entry[f] ?? null;
  body.ts = new Date(entry.ts).toISOString();
  body.details = entry.details ?? {};
  return crypto.createHash('sha256').update((prevHash ?? 'GENESIS') + '|' + canonicalJson(body)).digest('hex');
}

/**
 * Append one entry to the immutable audit log. Entries form a SHA-256 chain
 * (each hash covers the previous hash), so any edit made directly in the
 * database is detectable with verifyChain().
 */
export async function audit(entry, client = null) {
  const own = !client;
  const c = client ?? (await pool.connect());
  try {
    if (own) await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [CHAIN_LOCK]);
    const prev = await c.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prevHash = prev.rows[0]?.hash ?? null;
    const row = { ...entry, actor: entry.actor ?? 'system', ts: new Date(), details: entry.details ?? {} };
    const hash = hashEntry(row, prevHash);
    const res = await c.query(
      `INSERT INTO audit_log (ts, event, actor, run_id, channel, direction, contact_name, address, status, provider_message_id, error, details, prev_hash, hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [row.ts, row.event, row.actor ?? 'system', row.run_id ?? null, row.channel ?? null, row.direction ?? null,
        row.contact_name ?? null, row.address ?? null, row.status ?? null, row.provider_message_id ?? null,
        row.error ?? null, row.details, prevHash, hash],
    );
    if (own) await c.query('COMMIT');
    return res.rows[0].id;
  } catch (err) {
    if (own) await c.query('ROLLBACK').catch(() => {});
    logger.error({ err, event: entry.event }, 'failed to write audit log');
    throw err;
  } finally {
    if (own) c.release();
  }
}

/** Re-compute the whole chain. Returns the first broken entry, if any. */
export async function verifyChain() {
  const client = await pool.connect();
  try {
    let prevHash = null;
    let count = 0;
    let lastId = 0;
    for (;;) {
      const { rows } = await client.query('SELECT * FROM audit_log WHERE id > $1 ORDER BY id LIMIT 5000', [lastId]);
      if (!rows.length) break;
      for (const r of rows) {
        const expected = hashEntry(r, prevHash);
        if (r.prev_hash !== prevHash || r.hash !== expected) {
          return { ok: false, checked: count, brokenAt: r.id, reason: r.prev_hash !== prevHash ? 'prev_hash mismatch' : 'content hash mismatch' };
        }
        prevHash = r.hash;
        lastId = r.id;
        count++;
      }
    }
    return { ok: true, checked: count, head: prevHash };
  } finally {
    client.release();
  }
}
