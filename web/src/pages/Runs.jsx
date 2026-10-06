import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Empty, ErrorNote, fmtDate, useLoad } from '../util.jsx';

export default function Runs() {
  const { data, error } = useLoad(() => api.get('/runs?limit=100'), [], 10_000);
  return (
    <div className="page">
      <header className="page-head"><h1>Send history</h1></header>
      <ErrorNote error={error} />
      {data?.runs?.length === 0 && <Empty>No sends yet.</Empty>}
      {data?.runs?.length > 0 && (
        <section className="card">
          <table>
            <thead><tr><th>Run</th><th>Trigger</th><th>Created</th><th>Finished</th><th>Status</th><th className="num">Total</th><th className="num">Sent</th><th className="num">Failed</th><th className="num">Skipped</th></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/runs/${r.id}`}>#{r.id}</Link></td>
                  <td>{r.trigger === 'schedule' ? `Schedule: ${r.schedule_name ?? r.schedule_id}` : 'Send now'}</td>
                  <td>{fmtDate(r.created_at)}</td>
                  <td>{fmtDate(r.finished_at)}</td>
                  <td><Badge value={r.status} /></td>
                  <td className="num">{r.total}</td><td className="num">{r.sent}</td><td className="num">{r.failed}</td><td className="num">{r.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
