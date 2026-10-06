import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { createSource, syncSource, activeSource } from '../services/sources.js';
import { parseFile } from '../services/spreadsheet.js';
import { parseSheetUrl, fetchSheetRows } from '../services/googleSheets.js';
import { HttpError } from '../lib/errors.js';
import { parse, pageParams } from '../lib/validate.js';
import { actor } from '../auth.js';

const r = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /\.(csv|xls|xlsx)$/i.test(file.originalname)),
});

r.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM data_sources ORDER BY created_at DESC LIMIT 20');
  res.json({ sources: rows });
});

r.get('/active', async (_req, res) => res.json({ source: await activeSource() }));

r.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a .csv, .xls or .xlsx file');
  const rows = parseFile(req.file.buffer, req.file.originalname);
  const result = await createSource({ kind: 'upload', label: req.file.originalname, rows, admin: req.admin });
  res.status(201).json(result);
});

r.post('/google', async (req, res) => {
  const { url } = parse(z.object({ url: z.string().url() }), req.body);
  const { sheetId, gid } = parseSheetUrl(url);
  const rows = await fetchSheetRows(sheetId, gid);
  const result = await createSource({ kind: 'google_sheet', label: url, sheetId, gid, rows, admin: req.admin });
  res.status(201).json(result);
});

r.post('/:id/sync', async (req, res) => {
  const result = await syncSource(Number(req.params.id), { actor: actor(req) });
  res.json(result);
});

r.get('/contacts', async (req, res) => {
  const source = await activeSource();
  if (!source) return res.json({ source: null, contacts: [], total: 0 });
  const { limit, offset } = pageParams(req.query, 500);
  const search = `%${String(req.query.search || '').trim().toLowerCase()}%`;
  const onlyWarnings = req.query.warnings === '1';
  const where = `source_id = $1 AND (lower(coalesce(name,'')) LIKE $2 OR coalesce(email,'') LIKE $2 OR coalesce(whatsapp,'') LIKE $2 OR coalesce(status,'') LIKE $2)
                 ${onlyWarnings ? "AND jsonb_array_length(warnings) > 0" : ''}`;
  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    query(`SELECT c.*, EXISTS (SELECT 1 FROM telegram_links t WHERE t.phone = c.whatsapp AND t.blocked_at IS NULL) AS telegram_linked
             FROM contacts c WHERE ${where} ORDER BY row_number LIMIT $3 OFFSET $4`, [source.id, search, limit, offset]),
    query(`SELECT count(*)::int AS total FROM contacts WHERE ${where}`, [source.id, search]),
  ]);
  res.json({ source, contacts: rows, total });
});

/** Distinct status types in the active sheet and whether each has a template. */
r.get('/statuses', async (_req, res) => {
  const source = await activeSource();
  if (!source) return res.json({ statuses: [] });
  const { rows } = await query(
    `SELECT c.status, count(*)::int AS contacts, t.id AS template_id
       FROM contacts c LEFT JOIN templates t ON t.status_key = c.status
      WHERE c.source_id = $1 GROUP BY c.status, t.id ORDER BY c.status NULLS LAST`, [source.id]);
  res.json({ statuses: rows });
});

export default r;
