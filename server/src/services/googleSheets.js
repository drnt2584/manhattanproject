import fs from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { parseCsvBuffer } from './spreadsheet.js';

/** Extract spreadsheet id and tab gid from any Google Sheets URL. */
export function parseSheetUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new HttpError(400, 'That is not a valid URL');
  }
  if (u.hostname !== 'docs.google.com') throw new HttpError(400, 'Use a docs.google.com/spreadsheets link');
  const m = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) throw new HttpError(400, 'Could not find the spreadsheet id in that link');
  const gid = u.searchParams.get('gid') || (u.hash.match(/gid=(\d+)/) || [])[1] || '0';
  return { sheetId: m[1], gid };
}

let auth = null;
async function serviceAccountToken() {
  if (!config.google.serviceAccountFile) return null;
  if (!auth) {
    const credentials = JSON.parse(await fs.readFile(config.google.serviceAccountFile, 'utf8'));
    auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  }
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

async function fetchViaApi(sheetId, gid, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, { headers });
  if (!meta.ok) throw new HttpError(400, `Google Sheets API error (${meta.status}). Share the sheet with the service account email.`);
  const sheets = (await meta.json()).sheets || [];
  const tab = sheets.find((s) => String(s.properties.sheetId) === String(gid)) || sheets[0];
  const range = encodeURIComponent(`'${tab.properties.title.replace(/'/g, "''")}'`);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`, { headers });
  if (!res.ok) throw new HttpError(400, `Google Sheets API error (${res.status})`);
  const values = (await res.json()).values || [];
  if (values.length < 2) return [];
  const [head, ...body] = values;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

async function fetchViaCsvExport(sheetId, gid) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`, { redirect: 'follow' });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || type.includes('text/html')) {
    throw new HttpError(400, 'Could not read the Google Sheet. Either set sharing to "Anyone with the link can view", or configure a service account (GOOGLE_SERVICE_ACCOUNT_FILE) and share the sheet with it.');
  }
  return parseCsvBuffer(Buffer.from(await res.arrayBuffer()));
}

/** Fetch rows from a Google Sheet. Uses the service account if configured, else the public CSV export. */
export async function fetchSheetRows(sheetId, gid) {
  const token = await serviceAccountToken();
  return token ? fetchViaApi(sheetId, gid, token) : fetchViaCsvExport(sheetId, gid);
}
