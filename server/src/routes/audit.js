import { Router } from 'express';
import { query } from '../db.js';
import { verifyChain } from '../services/audit.js';
import { pageParams, csvCell } from '../lib/validate.js';

const r = Router();

function filters(q) {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q.event) add('event = ?', String(q.event));
  if (q.channel) add('channel = ?', String(q.channel));
  if (q.status) add('status = ?', String(q.status));
  if (q.run_id) add('run_id = ?', Number(q.run_id));
  if (q.from) add('ts >= ?', new Date(String(q.from)));
  if (q.to) add('ts <= ?', new Date(String(q.to)));
  if (q.search) add("(coalesce(address,'') || ' ' || coalesce(contact_name,'') || ' ' || coalesce(error,'')) ILIKE ?", `%${q.search}%`);
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

r.get('/', async (req, res) => {
  const { limit, offset } = pageParams(req.query, 500);
  const f = filters(req.query);
  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    query(`SELECT * FROM audit_log ${f.sql} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
    query(`SELECT count(*)::int AS total FROM audit_log ${f.sql}`, f.params),
  ]);
  res.json({ entries: rows, total });
});

r.get('/events', async (_req, res) => {
  const { rows } = await query('SELECT DISTINCT event FROM audit_log ORDER BY event');
  res.json({ events: rows.map((x) => x.event) });
});

r.get('/verify', async (_req, res) => res.json(await verifyChain()));

r.get('/export.csv', async (req, res) => {
  const f = filters(req.query);
  const cols = ['id', 'ts', 'event', 'actor', 'run_id', 'channel', 'direction', 'contact_name', 'address', 'status', 'provider_message_id', 'error', 'details', 'prev_hash', 'hash'];
  res.type('text/csv').attachment(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
  res.write(cols.join(',') + '\n');
  let lastId = Number.MAX_SAFE_INTEGER;
  for (;;) {
    const p = [...f.params, lastId];
    const { rows } = await query(
      `SELECT * FROM audit_log ${f.sql ? f.sql + ' AND' : 'WHERE'} id < $${p.length} ORDER BY id DESC LIMIT 2000`, p);
    if (!rows.length) break;
    for (const row of rows) res.write(cols.map((c) => csvCell(c === 'ts' ? row.ts.toISOString() : row[c])).join(',') + '\n');
    lastId = rows[rows.length - 1].id;
  }
  res.end();
});

export default r;
