import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Badge, ChannelTag, ErrorNote, Feedback, fmtDate, useAction, useLoad } from '../util.jsx';

export default function RunDetail() {
  const { id } = useParams();
  const [state, setState] = useState('');
  const [open, setOpen] = useState(null);
  const { data, error, reload } = useLoad(() => api.get(`/runs/${id}${qs({ state })}`), [id, state], 3000);
  const cancel = useAction();
  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="muted">Loading…</div>;
  const { run, recipients, progress } = data;
  const active = run.status === 'queued' || run.status === 'running';
  const count = (ch, st) => progress.filter((p) => p.channel === ch && (!st || p.state === st)).reduce((a, p) => a + p.n, 0);

  const doCancel = () => {
    if (!window.confirm('Stop this run? Messages already sent cannot be recalled; the rest will not be sent.')) return;
    cancel.run(() => api.post(`/runs/${id}/cancel`), 'Cancel requested.').then(reload);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Run #{run.id} <Badge value={run.status} /></h1>
        <div className="actions">
          {active && <button className="danger" onClick={doCancel} disabled={cancel.busy || run.cancel_requested}>{run.cancel_requested ? 'Stopping…' : 'Stop run'}</button>}
          {run.failed > 0 && <a className="button" href={`/api/runs/${run.id}/failures.csv`}>Download failures (CSV)</a>}
          <Link className="button" to={`/audit?run_id=${run.id}`}>Audit entries</Link>
        </div>
      </header>
      <Feedback action={cancel} />
      <section className="card">
        <dl className="facts">
          <div><dt>Trigger</dt><dd>{run.kind === 'reminders' ? `Overdue reminders (${run.trigger === 'automation' ? 'daily check' : 'sent manually'})` : run.trigger === 'schedule' ? `Schedule: ${run.schedule_name}` : 'Send now'}</dd></div>
          <div><dt>Source</dt><dd>{run.source_label || '—'}</dd></div>
          <div><dt>Started</dt><dd>{fmtDate(run.started_at)}</dd></div>
          <div><dt>Finished</dt><dd>{fmtDate(run.finished_at)}</dd></div>
          <div><dt>Admin notified</dt><dd>{fmtDate(run.admin_notified_at)}</dd></div>
        </dl>
        {run.error && <div className="note bad">{run.error}</div>}
        <div className="progress-grid">
          {['whatsapp', 'email'].map((ch, i) => (
            <div key={ch} className="progress">
              <div><span className="muted small">Step {i + 1}</span> <ChannelTag channel={ch} /></div>
              <div className="small">{count(ch, 'sent')} sent · {count(ch, 'failed')} failed · {count(ch, 'skipped')} skipped · {count(ch, 'pending') + count(ch, 'sending')} waiting</div>
              <div className="meter"><span style={{ width: `${count(ch) ? ((count(ch) - count(ch, 'pending') - count(ch, 'sending')) / count(ch)) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      {run.failure_report?.length > 0 && (
        <section className="card">
          <h2>Failed — {run.failure_report.length} affected</h2>
          <table>
            <thead><tr><th>Row</th><th>Contact</th><th>Channel</th><th>Address</th><th>Reason</th></tr></thead>
            <tbody>
              {run.failure_report.map((f, i) => (
                <tr key={i}><td>{f.row_number}</td><td>{f.contact_name}</td><td><ChannelTag channel={f.channel} /></td><td>{f.address || '—'}</td><td className="small">{f.error}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="toolbar">
          <h2>Recipients</h2>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="skipped">Skipped</option><option value="pending">Waiting</option>
          </select>
        </div>
        <div className="scroll">
          <table>
            <thead><tr><th>Row</th><th>Contact</th><th>Channel</th><th>Address</th><th>Template</th><th>Result</th><th>Tries</th><th>Detail</th></tr></thead>
            <tbody>
              {recipients.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td>{r.row_number}</td><td>{r.contact_name}</td><td><ChannelTag channel={r.channel} /></td><td>{r.address || '—'}</td>
                    <td>{r.status_key}</td><td><Badge value={r.state} /></td><td>{r.attempts}</td>
                    <td className="small">{r.last_error || (r.rendered_body && <button className="link" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'View message'}</button>)}</td>
                  </tr>
                  {open === r.id && <tr><td colSpan={8}><pre className="snippet">{r.rendered_subject ? `${r.rendered_subject}\n\n` : ''}{r.rendered_body}</pre></td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
