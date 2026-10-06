import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, CHANNEL_LABEL, ErrorNote, fmtDate, fmtRel, useLoad } from '../util.jsx';

function Tile({ label, value, sub, to }) {
  const body = (
    <>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </>
  );
  return to ? <Link to={to} className="tile">{body}</Link> : <div className="tile">{body}</div>;
}

export default function Dashboard() {
  const { data, error } = useLoad(() => api.get('/dashboard'), [], 15_000);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const t = Object.fromEntries(data.totals.map((x) => [x.channel, x]));
  const running = data.runs.find((r) => r.status === 'running' || r.status === 'queued');
  const maxDay = Math.max(1, ...data.daily.map((d) => d.sent + d.failed));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <Link className="button primary" to="/schedules">Send or schedule</Link>
      </header>

      {!data.source && (
        <div className="note warn">No contact list yet. <Link to="/contacts">Upload a CSV/Excel file or link a Google Sheet</Link> to get started.</div>
      )}
      {data.missingTemplates.length > 0 && (
        <div className="note warn">
          No template for status {data.missingTemplates.map((s) => `"${s}"`).join(', ')}. Those contacts will be recorded as failed.{' '}
          <Link to="/templates">Add templates</Link>
        </div>
      )}
      {running && (
        <div className="note info">Run #{running.id} is <Badge value={running.status} /> — <Link to={`/runs/${running.id}`}>watch progress</Link></div>
      )}

      <section className="tiles">
        <Tile label="Contacts" value={data.contacts.total} sub={`${data.contacts.whatsapp} mobile${data.chatChannels.includes('telegram') ? ` (${data.contacts.telegram} joined Telegram)` : ''} · ${data.contacts.email} email${data.contacts.warnings ? ` · ${data.contacts.warnings} with issues` : ''}`} to="/contacts" />
        <Tile label="Next scheduled send" value={data.nextSchedule ? fmtRel(data.nextSchedule.next_run_at) : 'None'} sub={data.nextSchedule ? `${data.nextSchedule.name} · ${fmtDate(data.nextSchedule.next_run_at)}` : 'Nothing scheduled'} to="/schedules" />
        <Tile label="Unread replies" value={data.unread} to="/inbox" />
        {data.chatChannels.map((ch) => <Tile key={ch} label={`${CHANNEL_LABEL[ch]} (30 days)`} value={t[ch]?.sent ?? 0} sub={`${t[ch]?.failed ?? 0} failed`} />)}
        <Tile label="Email (30 days)" value={t.email?.sent ?? 0} sub={`${t.email?.failed ?? 0} failed`} />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Recent runs</h2>
          {data.runs.length === 0 ? <p className="muted">No sends yet.</p> : (
            <table>
              <thead><tr><th>Run</th><th>Started</th><th>Status</th><th className="num">Sent</th><th className="num">Failed</th></tr></thead>
              <tbody>
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td><Link to={`/runs/${r.id}`}>#{r.id}</Link> <span className="muted small">{r.trigger}</span></td>
                    <td>{fmtDate(r.started_at || r.created_at)}</td>
                    <td><Badge value={r.status} /></td>
                    <td className="num">{r.sent}</td>
                    <td className="num">{r.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2>Last 14 days</h2>
          {data.daily.length === 0 ? <p className="muted">No activity yet.</p> : (
            <table className="daily">
              <thead><tr><th>Day</th><th>Messages</th><th className="num">Sent</th><th className="num">Failed</th><th className="num">Replies</th></tr></thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td className="bar-cell" aria-hidden="true">
                      <span className="bar ok" style={{ width: `${(d.sent / maxDay) * 100}%` }} />
                      <span className="bar bad" style={{ width: `${(d.failed / maxDay) * 100}%` }} />
                    </td>
                    <td className="num">{d.sent}</td><td className="num">{d.failed}</td><td className="num">{d.replies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.source && <p className="muted small">Source: {data.source.label} · synced {fmtRel(data.source.last_synced_at)}</p>}
        </section>
      </div>
    </div>
  );
}
