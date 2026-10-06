import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Empty, ErrorNote, Feedback, fmtDate, fmtRel, useAction, useLoad } from '../util.jsx';

const PAGE = 100;

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const act = useAction();

  const list = useLoad(() => api.get('/sources/contacts' + qs({ search, warnings: warningsOnly ? 1 : '', limit: PAGE, offset })), [search, warningsOnly, offset]);
  const statuses = useLoad(() => api.get('/sources/statuses'), []);
  const reloadAll = () => { list.reload(); statuses.reload(); };
  const source = list.data?.source;

  const summaryMsg = (r) => `Loaded ${r.summary.rows} contacts (${r.summary.withWhatsapp} WhatsApp, ${r.summary.withEmail} email${r.summary.withWarnings ? `, ${r.summary.withWarnings} with issues` : ''}). This is now the active source.`;

  const uploadFile = (e) => {
    e.preventDefault();
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    act.run(() => api.post('/sources/upload', fd), summaryMsg).then((r) => r && (setFile(null), e.target.reset(), setOffset(0), reloadAll()));
  };
  const linkSheet = (e) => {
    e.preventDefault();
    act.run(() => api.post('/sources/google', { url }), summaryMsg).then((r) => r && (setUrl(''), setOffset(0), reloadAll()));
  };
  const sync = () => act.run(() => api.post(`/sources/${source.id}/sync`), (r) => `Synced ${r.summary?.rows ?? 0} rows from Google Sheets.`).then(reloadAll);

  return (
    <div className="page">
      <header className="page-head"><h1>Contacts & source</h1></header>

      <section className="card">
        <h2>Current source</h2>
        {source ? (
          <div className="source">
            <div>
              <strong>{source.kind === 'google_sheet' ? 'Google Sheet' : 'Uploaded file'}</strong>{' '}
              {source.kind === 'google_sheet' ? <a href={source.label} target="_blank" rel="noreferrer">{source.label}</a> : source.label}
              <div className="muted small">{source.row_count} rows · last loaded {fmtRel(source.last_synced_at)} ({fmtDate(source.last_synced_at)})</div>
              {source.last_sync_error && <div className="note bad small">Last sync failed: {source.last_sync_error}</div>}
              {source.kind === 'google_sheet' && <p className="muted small">The sheet is re-read automatically right before every send, so the latest names and amounts are used.</p>}
            </div>
            {source.kind === 'google_sheet' && <button onClick={sync} disabled={act.busy}>Sync now</button>}
          </div>
        ) : <p className="muted">No source yet. Upload a file or link a Google Sheet below.</p>}
        <Feedback action={act} />
        <div className="grid-2 gap-top">
          <form onSubmit={uploadFile} className="stack">
            <h3>Upload a file</h3>
            <input type="file" accept=".csv,.xls,.xlsx" onChange={(e) => setFile(e.target.files[0] || null)} />
            <button className="primary" disabled={!file || act.busy}>Upload & use this file</button>
          </form>
          <form onSubmit={linkSheet} className="stack">
            <h3>Link a Google Sheet</h3>
            <input type="url" placeholder="https://docs.google.com/spreadsheets/d/…" value={url} onChange={(e) => setUrl(e.target.value)} required />
            <button className="primary" disabled={!url || act.busy}>Connect & use this sheet</button>
            <p className="muted small">Share the sheet as “Anyone with the link can view”, or share it with the service account configured on the server.</p>
          </form>
        </div>
        <details className="gap-top">
          <summary>Expected columns</summary>
          <p className="small">The first row must be headers. Recognised names (case and spacing don't matter):</p>
          <ul className="small">
            <li><b>Name</b> — name, full name, contact name, customer name</li>
            <li><b>WhatsApp</b> — whatsapp, whatsapp number, phone, mobile, contact number</li>
            <li><b>Email</b> — email, email address, e-mail</li>
            <li><b>Status</b> — status, status type, type, category (picks the template)</li>
            <li><b>Amount</b> — amount, upcoming amount, quarterly dues, dues, amount due, value, balance, total</li>
            <li><b>Due date</b> (optional, needed for reminders) — due date, payment due, due, pay by, deadline</li>
            <li><b>Previous unpaid</b> (optional) — previous unpaid, previous balance, arrears, past due</li>
            <li><b>Unit</b> (optional) — unit, unit no, unit number</li>
          </ul>
          <p className="small">Any other column is also usable in templates, e.g. a “Due Date” column becomes <code>{'{{due_date}}'}</code>.</p>
        </details>
      </section>

      {statuses.data?.statuses?.length > 0 && (
        <section className="card">
          <h2>Status types</h2>
          <table>
            <thead><tr><th>Status</th><th className="num">Contacts</th><th>Template</th></tr></thead>
            <tbody>
              {statuses.data.statuses.map((s) => (
                <tr key={s.status ?? '(blank)'}>
                  <td>{s.status ?? <span className="muted">(blank)</span>}</td>
                  <td className="num">{s.contacts}</td>
                  <td>{s.template_id ? 'Yes' : <Link to="/templates">Missing — add one</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <h2>Contacts {list.data && <span className="muted">({list.data.total})</span>}</h2>
          <input type="search" placeholder="Search name, email, phone, status" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
          <label className="inline"><input type="checkbox" checked={warningsOnly} onChange={(e) => { setWarningsOnly(e.target.checked); setOffset(0); }} /> Only rows with issues</label>
        </div>
        <ErrorNote error={list.error} />
        {list.data?.contacts?.length === 0 && <Empty>No contacts match.</Empty>}
        {list.data?.contacts?.length > 0 && (
          <div className="scroll">
            <table>
              <thead><tr><th>Row</th><th>Name</th><th>WhatsApp</th><th>Email</th><th>Status</th><th className="num">Amount</th><th>Due date</th><th>Issues</th></tr></thead>
              <tbody>
                {list.data.contacts.map((c) => (
                  <tr key={c.id} className={c.warnings.length ? 'row-warn' : ''}>
                    <td>{c.row_number}</td><td>{c.name}</td><td>{c.whatsapp ? `+${c.whatsapp}` : '—'}</td><td>{c.email || '—'}</td>
                    <td>{c.status}</td><td className="num">{c.amount ?? '—'}</td><td className="nowrap">{c.due_date ?? '—'}</td><td className="small">{c.warnings.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && list.data.total > PAGE && (
          <div className="pager">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <span className="muted">{offset + 1}–{Math.min(offset + PAGE, list.data.total)} of {list.data.total}</span>
            <button disabled={offset + PAGE >= list.data.total} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
