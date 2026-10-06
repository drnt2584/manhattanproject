import { tx, query } from '../db.js';
import { audit } from './audit.js';
import { rowsToContacts } from './spreadsheet.js';
import { fetchSheetRows } from './googleSheets.js';

async function replaceContacts(client, sourceId, contacts) {
  await client.query('DELETE FROM contacts WHERE source_id = $1', [sourceId]);
  const chunk = 500;
  for (let i = 0; i < contacts.length; i += chunk) {
    const part = contacts.slice(i, i + chunk);
    const values = [];
    const params = [];
    part.forEach((c, j) => {
      const b = j * 9;
      values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
      params.push(sourceId, c.row_number, c.name, c.whatsapp, c.email, c.status, c.amount, c.fields, JSON.stringify(c.warnings));
    });
    await client.query(
      `INSERT INTO contacts (source_id, row_number, name, whatsapp, email, status, amount, fields, warnings) VALUES ${values.join(',')}`,
      params,
    );
  }
}

function summarize(contacts) {
  return {
    rows: contacts.length,
    withWhatsapp: contacts.filter((c) => c.whatsapp).length,
    withEmail: contacts.filter((c) => c.email).length,
    withWarnings: contacts.filter((c) => c.warnings.length).length,
    statuses: [...new Set(contacts.map((c) => c.status).filter(Boolean))].sort(),
  };
}

/** Create a new data source from parsed rows and make it the active one. */
export async function createSource({ kind, label, sheetId = null, gid = null, rows, admin }) {
  const { contacts, columns, mapping } = rowsToContacts(rows);
  const source = await tx(async (c) => {
    await c.query('UPDATE data_sources SET is_active = FALSE WHERE is_active');
    const { rows: [s] } = await c.query(
      `INSERT INTO data_sources (kind, label, sheet_id, sheet_gid, is_active, row_count, columns, last_synced_at, created_by)
       VALUES ($1,$2,$3,$4,TRUE,$5,$6,now(),$7) RETURNING *`,
      [kind, label, sheetId, gid, contacts.length, JSON.stringify(columns), admin?.id ?? null],
    );
    await replaceContacts(c, s.id, contacts);
    await audit({
      event: 'source_activated', actor: admin ? `admin:${admin.email}` : 'system',
      details: { source_id: s.id, kind, label, mapping, ...summarize(contacts) },
    }, c);
    return s;
  });
  return { source, mapping, summary: summarize(contacts) };
}

/** Re-pull a Google Sheet source so sends use the latest values. Uploaded files are a fixed snapshot. */
export async function syncSource(sourceId, { actor = 'system', runId = null } = {}) {
  const { rows: [source] } = await query('SELECT * FROM data_sources WHERE id = $1', [sourceId]);
  if (!source) throw new Error(`data source ${sourceId} not found`);
  if (source.kind !== 'google_sheet') return { source, summary: null, synced: false };
  try {
    const rows = await fetchSheetRows(source.sheet_id, source.sheet_gid);
    const { contacts, columns, mapping } = rowsToContacts(rows);
    await tx(async (c) => {
      await replaceContacts(c, source.id, contacts);
      await c.query(
        'UPDATE data_sources SET row_count = $2, columns = $3, last_synced_at = now(), last_sync_error = NULL WHERE id = $1',
        [source.id, contacts.length, JSON.stringify(columns)],
      );
      await audit({ event: 'source_synced', actor, run_id: runId, details: { source_id: source.id, mapping, ...summarize(contacts) } }, c);
    });
    return { source, summary: summarize(contacts), synced: true };
  } catch (err) {
    await query('UPDATE data_sources SET last_sync_error = $2 WHERE id = $1', [source.id, err.message]);
    await audit({ event: 'source_sync_failed', actor, run_id: runId, status: 'failed', error: err.message, details: { source_id: source.id } });
    throw err;
  }
}

export async function activeSource() {
  const { rows } = await query('SELECT * FROM data_sources WHERE is_active LIMIT 1');
  return rows[0] ?? null;
}
