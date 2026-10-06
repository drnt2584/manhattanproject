import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Badge, ChannelTag, ErrorNote, Feedback, useAction, useLoad } from '../util.jsx';

const PAGE = 100;

export default function Audit() {
  const [params] = useSearchParams();
  const [f, setF] = useState({ event: '', channel: '', status: '', search: '', run_id: params.get('run_id') || '', from: '', to: '' });
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const filters = { ...f, from: f.from ? new Date(f.from).toISOString() : '', to: f.to ? new Date(f.to).toISOString() : '' };
  const list = useLoad(() => api.get('/audit' + qs({ ...filters, limit: PAGE, offset })), [JSON.stringify(f), offset]);
  const events = useLoad(() => api.get('/audit/events'), []);
  const verify = useAction();
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setOffset(0); };

  const doVerify = () => verify.run(() => api.get('/audit/verify'), (r) => (r.ok
    ? `Integrity check passed: all ${r.checked} entries are unaltered.`
    : `INTEGRITY CHECK FAILED at entry #${r.brokenAt} (${r.reason}). The log has been modified outside the app.`));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Audit log</h1>
        <div className="actions">
          <button onClick={doVerify} disabled={verify.busy}>Verify integrity</button>
          <a className="button" href={'/api/audit/export.csv' + qs(filters)}>Export CSV</a>
        </div>
      </header>
      <p className="muted">Append-only record of every send attempt (successful or failed), delivery receipt, reply and admin action. Entries cannot be edited or deleted, and each is chained to the previous one with a SHA-256 hash.</p>
      <Feedback action={verify} />
      <section className="card">
        <div className="filters">
          <select value={f.event} onChange={set('event')}><option value="">All events</option>{events.data?.events?.map((e) => <option key={e}>{e}</option>)}</select>
          <select value={f.channel} onChange={set('channel')}><option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
          <select value={f.status} onChange={set('status')}><option value="">Any result</option><option>sent</option><option>failed</option><option>retrying</option><option>skipped</option><option>delivered</option><option>read</option><option>received</option></select>
          <input placeholder="Run #" className="narrow" value={f.run_id} onChange={(e) => { setF({ ...f, run_id: e.target.value.replace(/\D/g, '') }); setOffset(0); }} />
          <input type="search" placeholder="Name, address or error" value={f.search} onChange={set('search')} />
          <label className="inline small">From <input type="datetime-local" value={f.from} onChange={set('from')} /></label>
          <label className="inline small">To <input type="datetime-local" value={f.to} onChange={set('to')} /></label>
        </div>
        <ErrorNote error={list.error} />
        <div className="scroll">
          <table className="audit">
            <thead><tr><th>#</th><th>Time</th><th>Event</th><th>Run</th><th>Channel</th><th>Contact</th><th>Address</th><th>Result</th><th>Error / detail</th></tr></thead>
            <tbody>
              {list.data?.entries?.map((e) => (
                <React.Fragment key={e.id}>
                  <tr onClick={() => setOpen(open === e.id ? null : e.id)} className="clickable">
                    <td>{e.id}</td>
                    <td className="nowrap">{new Date(e.ts).toLocaleString()}</td>
                    <td>{e.event.replace(/_/g, ' ')}<div className="muted small">{e.actor}</div></td>
                    <td>{e.run_id ?? ''}</td>
                    <td>{e.channel && <ChannelTag channel={e.channel} />}</td>
                    <td>{e.contact_name}</td>
                    <td>{e.address}</td>
                    <td><Badge value={e.status} /></td>
                    <td className="small">{e.error}</td>
                  </tr>
                  {open === e.id && (
                    <tr><td colSpan={9}><pre className="snippet">{JSON.stringify({ details: e.details, provider_message_id: e.provider_message_id, hash: e.hash, prev_hash: e.prev_hash }, null, 2)}</pre></td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {list.data && (
          <div className="pager">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
            <span className="muted">{list.data.total ? `${offset + 1}–${Math.min(offset + PAGE, list.data.total)} of ${list.data.total}` : 'No entries'}</span>
            <button disabled={offset + PAGE >= list.data.total} onClick={() => setOffset(offset + PAGE)}>Older</button>
          </div>
        )}
      </section>
    </div>
  );
}
