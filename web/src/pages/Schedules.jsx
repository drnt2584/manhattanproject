import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, chatLabel, Empty, ErrorNote, Feedback, fmtDate, fmtRel, useAction, useChatChannels, useLoad } from '../util.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeCron(cron) {
  const [m, h, dom, , dow] = cron.split(' ');
  const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return `Every day at ${time}`;
  if (dom === '*' && /^\d$/.test(dow)) return `Every ${DAYS[Number(dow)]} at ${time}`;
  if (/^\d+$/.test(dom) && dow === '*') return `Monthly on day ${dom} at ${time}`;
  return cron;
}

export default function Schedules() {
  const list = useLoad(() => api.get('/schedules'), [], 20_000);
  const navigate = useNavigate();
  const sendNow = useAction();
  const create = useAction();
  const cancel = useAction();
  const tz = list.data?.timezone || 'UTC';
  const chat = chatLabel(useChatChannels());

  const [form, setForm] = useState({ name: '', mode: 'once', at: '', freq: 'monthly', time: '09:00', dow: '1', dom: '1', cron: '' });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const doSendNow = async () => {
    if (!window.confirm(`Send notifications to everyone in the current list now? ${chat} goes first, then email.`)) return;
    const r = await sendNow.run(() => api.post('/runs'));
    if (r) navigate(`/runs/${r.run.id}`);
  };

  const submit = (e) => {
    e.preventDefault();
    let body;
    if (form.mode === 'once') {
      body = { name: form.name, run_at: new Date(form.at).toISOString() };
    } else {
      const [h, m] = form.time.split(':').map(Number);
      const cron = form.freq === 'custom' ? form.cron.trim()
        : form.freq === 'daily' ? `${m} ${h} * * *`
          : form.freq === 'weekly' ? `${m} ${h} * * ${form.dow}`
            : `${m} ${h} ${form.dom} * *`;
      body = { name: form.name, cron, timezone: tz };
    }
    create.run(() => api.post('/schedules', body), 'Schedule saved.').then((r) => r && (setForm({ ...form, name: '', at: '' }), list.reload()));
  };

  const doCancel = (s) => {
    if (!window.confirm(`Cancel the schedule "${s.name}"? It will not send.`)) return;
    cancel.run(() => api.post(`/schedules/${s.id}/cancel`), 'Schedule cancelled.').then(list.reload);
  };

  return (
    <div className="page">
      <header className="page-head"><h1>Send & schedule</h1></header>

      <section className="card">
        <h2>Send now</h2>
        <p className="muted">Sends to the whole active list immediately: first the chat messages ({chat}: Telegram for residents who joined the bot, otherwise WhatsApp), then every email. If the source is a Google Sheet it is re-read first.</p>
        <Feedback action={sendNow} />
        <button className="primary" onClick={doSendNow} disabled={sendNow.busy}>{sendNow.busy ? 'Queuing…' : 'Send now'}</button>
      </section>

      <section className="card">
        <h2>Schedule a send</h2>
        <form onSubmit={submit} className="stack">
          <label>Name<input value={form.name} onChange={set('name')} placeholder="October statements" required /></label>
          <div className="segmented" role="radiogroup">
            <label className="inline"><input type="radio" name="mode" value="once" checked={form.mode === 'once'} onChange={set('mode')} /> One time</label>
            <label className="inline"><input type="radio" name="mode" value="repeat" checked={form.mode === 'repeat'} onChange={set('mode')} /> Repeating</label>
          </div>
          {form.mode === 'once' ? (
            <label>Date and time (your browser's time zone)
              <input type="datetime-local" value={form.at} onChange={set('at')} required />
            </label>
          ) : (
            <div className="grid-3">
              <label>Repeat
                <select value={form.freq} onChange={set('freq')}>
                  <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom (cron)</option>
                </select>
              </label>
              {form.freq === 'weekly' && <label>Day<select value={form.dow} onChange={set('dow')}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>}
              {form.freq === 'monthly' && <label>Day of month<input type="number" min="1" max="28" value={form.dom} onChange={set('dom')} /></label>}
              {form.freq === 'custom'
                ? <label>Cron expression<input value={form.cron} onChange={set('cron')} placeholder="0 9 1,15 * *" required /></label>
                : <label>Time ({tz})<input type="time" value={form.time} onChange={set('time')} required /></label>}
            </div>
          )}
          <Feedback action={create} />
          <div><button className="primary" disabled={create.busy}>Save schedule</button></div>
        </form>
      </section>

      <section className="card">
        <h2>Schedules</h2>
        <ErrorNote error={list.error} />
        <Feedback action={cancel} />
        {list.data?.schedules?.length === 0 && <Empty>Nothing scheduled.</Empty>}
        {list.data?.schedules?.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>When</th><th>Next send</th><th>Status</th><th>Last run</th><th /></tr></thead>
            <tbody>
              {list.data.schedules.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.cron ? `${describeCron(s.cron)} (${s.timezone})` : 'One time'}</td>
                  <td>{s.status === 'active' ? <>{fmtDate(s.next_run_at)} <span className="muted small">{fmtRel(s.next_run_at)}</span></> : '—'}</td>
                  <td><Badge value={s.status} /></td>
                  <td>{s.last_run_id ? <Link to={`/runs/${s.last_run_id}`}>#{s.last_run_id}</Link> : '—'} {s.last_run_status && <Badge value={s.last_run_status} />}</td>
                  <td className="right">{s.status === 'active' && <button className="danger" onClick={() => doCancel(s)} disabled={cancel.busy}>Cancel schedule</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
