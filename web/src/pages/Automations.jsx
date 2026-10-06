import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Badge, Empty, ErrorNote, Feedback, ChannelTag, fmtDate, useAction, useLoad } from '../util.jsx';

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

function Toggle({ value, onChange, label }) {
  return <label className="inline"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> <b>{label}</b></label>;
}

function Reminders({ initial, lastRun, templates, onSaved }) {
  const [s, setS] = useState(initial);
  const save = useAction();
  const runNow = useAction();
  const navigate = useNavigate();
  const preview = useLoad(() => api.get('/automations/reminders/preview'), []);
  const setRule = (i, k, v) => setS({ ...s, rules: s.rules.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });

  const submit = (e) => {
    e.preventDefault();
    save.run(() => api.put('/automations/reminders', s), 'Reminder settings saved.').then((r) => r && (onSaved(), preview.reload()));
  };
  const doRun = async () => {
    if (!window.confirm('Send the reminders listed below now?')) return;
    const r = await runNow.run(() => api.post('/automations/reminders/run'));
    if (r) navigate(`/runs/${r.run.id}`);
  };

  return (
    <section className="card">
      <h2>Overdue reminders</h2>
      <p className="muted">Every day at the time below, the app re-reads the sheet. Accounts whose status is still unpaid get the reminder for the latest stage they have reached since the due date. Each stage is sent only once per bill. Marking an account as paid in the sheet stops its reminders.</p>
      <form onSubmit={submit} className="stack">
        <Toggle value={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label="Send reminders automatically every day" />
        <div className="grid-2">
          <label>Daily check time (24-hour)<input value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} placeholder="09:00" /></label>
          <label>Status values that mean “unpaid”<input value={s.unpaid_statuses.join(', ')} onChange={(e) => setS({ ...s, unpaid_statuses: list(e.target.value) })} /></label>
        </div>
        <table>
          <thead><tr><th>Days after due date</th><th>Template</th><th /></tr></thead>
          <tbody>
            {s.rules.map((r, i) => (
              <tr key={i}>
                <td><input type="number" min="0" className="narrow" value={r.days} onChange={(e) => setRule(i, 'days', Number(e.target.value))} /></td>
                <td>
                  <select value={r.template} onChange={(e) => setRule(i, 'template', e.target.value)}>
                    {!templates.includes(r.template) && <option value={r.template}>{r.template} (missing)</option>}
                    {templates.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="right"><button type="button" className="danger" onClick={() => setS({ ...s, rules: s.rules.filter((_, j) => j !== i) })} disabled={s.rules.length === 1}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions">
          <button type="button" onClick={() => setS({ ...s, rules: [...s.rules, { days: (s.rules.at(-1)?.days ?? 0) + 7, template: templates[0] ?? '' }] })}>Add stage</button>
          <button className="primary" disabled={save.busy}>Save reminder settings</button>
        </div>
        <Feedback action={save} />
      </form>
      {lastRun && <p className="muted small">Last automatic check: {lastRun.date} (<Link to={`/runs/${lastRun.run_id}`}>run #{lastRun.run_id}</Link>)</p>}

      <div className="toolbar gap-top">
        <h3>Due for a reminder today {preview.data && <span className="muted">({preview.data.items.length})</span>}</h3>
        <button onClick={doRun} disabled={runNow.busy || !preview.data?.items.length}>Send these reminders now</button>
      </div>
      <Feedback action={runNow} />
      <ErrorNote error={preview.error} />
      {preview.data?.items.length === 0 && <Empty>No unpaid account has reached a new reminder stage today.</Empty>}
      {preview.data?.items.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Row</th><th>Name</th><th>Unit</th><th>Due date</th><th className="num">Days overdue</th><th>Reminder</th><th>Sends to</th></tr></thead>
            <tbody>
              {preview.data.items.map((i) => (
                <tr key={i.key}>
                  <td>{i.row_number}</td><td>{i.name}</td><td>{i.unit}</td><td>{i.due_date}</td><td className="num">{i.days_overdue}</td>
                  <td>+{i.stage} days · {i.template} {!i.template_exists && <span className="badge tone-bad">template missing</span>}</td>
                  <td className="small">{[i.whatsapp && `+${i.whatsapp}`, i.email].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Privacy({ initial, counts, onSaved }) {
  const [s, setS] = useState(initial);
  const save = useAction();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    save.run(() => api.put('/automations/privacy', s), 'Privacy notice saved.').then((r) => r && onSaved());
  };
  return (
    <section className="card">
      <h2>Data privacy notice (chat)</h2>
      <p className="muted">When someone who is <b>not in the contact list</b> messages for the first time, they automatically get this notice. Their YES or NO is recorded in <Link to="/consents">Privacy consents</Link> ({counts.accepted ?? 0} accepted, {counts.declined ?? 0} declined, {counts.pending ?? 0} waiting).</p>
      <form onSubmit={submit} className="stack">
        <Toggle value={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label="Send the privacy notice to new, unknown senders" />
        <label>Notice<textarea rows={9} value={s.notice} onChange={set('notice')} /></label>
        <div className="grid-3">
          <label>Reply when they say YES<textarea rows={4} value={s.accepted_reply} onChange={set('accepted_reply')} /></label>
          <label>Reply when they say NO<textarea rows={4} value={s.declined_reply} onChange={set('declined_reply')} /></label>
          <label>Reply when the answer is unclear<textarea rows={4} value={s.invalid_reply} onChange={set('invalid_reply')} /></label>
        </div>
        <div className="grid-2">
          <label>Counts as YES<input value={s.yes_words.join(', ')} onChange={(e) => setS({ ...s, yes_words: list(e.target.value) })} /></label>
          <label>Counts as NO<input value={s.no_words.join(', ')} onChange={(e) => setS({ ...s, no_words: list(e.target.value) })} /></label>
        </div>
        <Feedback action={save} />
        <div><button className="primary" disabled={save.busy}>Save privacy notice</button></div>
      </form>
    </section>
  );
}

function Balance({ initial, onSaved }) {
  const [s, setS] = useState(initial);
  const [to, setTo] = useState('');
  const save = useAction();
  const pv = useAction();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    save.run(() => api.put('/automations/balance', s), 'Balance replies saved.').then((r) => r && onSaved());
  };
  const [pvText, setPvText] = useState(null);
  useEffect(() => { setPvText(null); }, [to]);

  return (
    <section className="card">
      <h2>Balance inquiries (chat and email)</h2>
      <p className="muted">When a resident in the contact list asks about their balance, the app re-reads the sheet and replies with their latest figures and how many days overdue they are. The question and the reply also appear in Replies and in the audit log.</p>
      <form onSubmit={submit} className="stack">
        <Toggle value={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} label="Answer balance questions automatically" />
        <label>Words that trigger a balance reply<input value={s.keywords.join(', ')} onChange={(e) => setS({ ...s, keywords: list(e.target.value) })} /></label>
        <label>Reply for unpaid accounts<textarea rows={9} value={s.reply} onChange={set('reply')} /></label>
        <div className="grid-2">
          <label>Reply for paid accounts<textarea rows={3} value={s.paid_reply} onChange={set('paid_reply')} /></label>
          <label>Reply when the number or email is not in the list<textarea rows={3} value={s.not_found_reply} onChange={set('not_found_reply')} /></label>
        </div>
        <p className="muted small">Useful variables: <code>{'{{first_name}}'}</code><code>{'{{unit}}'}</code><code>{'{{billing_period}}'}</code><code>{'{{amount_formatted}}'}</code><code>{'{{previous_unpaid_formatted}}'}</code><code>{'{{total_due_formatted}}'}</code><code>{'{{due_date_formatted}}'}</code><code>{'{{days_overdue}}'}</code><code>{'{{due_status}}'}</code></p>
        <Feedback action={save} />
        <div><button className="primary" disabled={save.busy}>Save balance replies</button></div>
      </form>
      <form onSubmit={(e) => { e.preventDefault(); pv.run(() => api.post('/automations/balance/preview', { to })).then((r) => r && setPvText(r)); }} className="toolbar gap-top">
        <h3>Try it</h3>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Mobile number or email from the sheet" style={{ maxWidth: 320 }} />
        <button disabled={!to || pv.busy}>Preview reply</button>
      </form>
      <ErrorNote error={pv.error} />
      {pvText && <pre className="snippet">{pvText.text ?? `No automatic reply: ${pvText.error}`}</pre>}
    </section>
  );
}

function TelegramBot({ initial, status, onSaved }) {
  const [s, setS] = useState(initial);
  const save = useAction();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    save.run(() => api.put('/automations/telegram', s), 'Bot messages saved.').then((r) => r && onSaved());
  };
  return (
    <section className="card">
      <h2>Telegram bot</h2>
      <p className="muted">
        A Telegram bot can only message people who opened it and shared their phone number. Send residents the bot link
        {status?.link ? <> (<a href={status.link} target="_blank" rel="noreferrer">{status.link}</a>)</> : ''}. When they tap
        “Share my phone number”, the app matches the number to their row in the sheet. {status ? `${status.linked} joined so far.` : ''}
      </p>
      <form onSubmit={submit} className="stack">
        <div className="grid-2">
          <label>Welcome (after /start)<textarea rows={6} value={s.welcome} onChange={set('welcome')} /></label>
          <label>Linked to a unit<textarea rows={6} value={s.linked_reply} onChange={set('linked_reply')} /></label>
        </div>
        <div className="grid-3">
          <label>Message sent before sharing the number<textarea rows={4} value={s.share_prompt} onChange={set('share_prompt')} /></label>
          <label>Number not in the sheet (then the privacy notice follows)<textarea rows={4} value={s.number_received} onChange={set('number_received')} /></label>
          <label>Already linked<textarea rows={4} value={s.already_linked} onChange={set('already_linked')} /></label>
        </div>
        <div className="grid-2">
          <label>Shared someone else's number<textarea rows={3} value={s.not_own_number} onChange={set('not_own_number')} /></label>
          <label>Button text<input value={s.share_button} onChange={set('share_button')} /></label>
        </div>
        <Feedback action={save} />
        <div><button className="primary" disabled={save.busy}>Save bot messages</button></div>
      </form>
    </section>
  );
}

export default function Automations() {
  const { data, error, reload } = useLoad(() => api.get('/automations'), []);
  const tpl = useLoad(() => api.get('/templates'), []);
  const status = useLoad(() => api.get('/settings/status'), []);
  if (error) return <ErrorNote error={error} />;
  if (!data || !tpl.data) return <div className="muted">Loading…</div>;
  const keys = tpl.data.templates.map((t) => t.status_key);
  return (
    <div className="page">
      <header className="page-head"><h1>Automations</h1></header>
      {status.data?.telegram?.enabled && <TelegramBot initial={data.settings.telegram} status={status.data.telegram} onSaved={reload} />}
      <Reminders initial={data.settings.reminders} lastRun={data.lastReminderRun} templates={keys} onSaved={reload} />
      <Privacy initial={data.settings.privacy} counts={data.consents} onSaved={reload} />
      <Balance initial={data.settings.balance} onSaved={reload} />
    </div>
  );
}

export function Consents() {
  const [status, setStatus] = useState('');
  const { data, error } = useLoad(() => api.get(`/automations/consents${status ? `?status=${status}` : ''}`), [status]);
  return (
    <div className="page">
      <header className="page-head">
        <h1>Privacy consents</h1>
        <a className="button" href={`/api/automations/consents/export.csv${status ? `?status=${status}` : ''}`}>Export CSV</a>
      </header>
      <p className="muted">People outside the contact list who messaged the building and got the Data Privacy Notice. Each answer is also in the audit log. To add someone who accepted to the contact list, add a row for them in the spreadsheet.</p>
      <section className="card">
        <div className="toolbar">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option><option value="accepted">Accepted</option><option value="declined">Declined</option><option value="pending">Waiting for answer</option>
          </select>
        </div>
        <ErrorNote error={error} />
        {data?.consents?.length === 0 && <Empty>No one yet.</Empty>}
        {data?.consents?.length > 0 && (
          <table>
            <thead><tr><th>Name (chat profile)</th><th>Number</th><th>Answer</th><th>Notice sent</th><th>Answered</th><th>Their reply</th></tr></thead>
            <tbody>
              {data.consents.map((c) => (
                <tr key={c.id}>
                  <td>{c.profile_name || '—'} <ChannelTag channel={c.channel} /></td>
                  <td>{c.channel === 'email' ? c.address : `+${c.address}`}</td>
                  <td><Badge value={c.status === 'pending' ? 'pending' : c.status} /></td>
                  <td>{fmtDate(c.notice_sent_at)}</td><td>{fmtDate(c.responded_at)}</td><td className="small">{c.response_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
