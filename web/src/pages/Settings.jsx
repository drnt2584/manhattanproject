import React, { useState } from 'react';
import { api } from '../api.js';
import { ErrorNote, Feedback, useAction, useLoad } from '../util.jsx';

export default function Settings() {
  const { data, error } = useLoad(() => api.get('/settings/status'), []);
  const test = useAction();
  const pw = useAction();
  const [t, setT] = useState({ channel: 'email', to: '', template_name: '' });
  const [p, setP] = useState({ current: '', next: '' });

  const sendTest = (e) => {
    e.preventDefault();
    test.run(() => api.post('/settings/test', { ...t, template_name: t.template_name || undefined }), (r) => `Sent. Message id: ${r.id}`);
  };
  const changePw = (e) => {
    e.preventDefault();
    pw.run(() => api.post('/auth/password', p), 'Password changed.').then((r) => r && setP({ current: '', next: '' }));
  };

  return (
    <div className="page">
      <header className="page-head"><h1>Settings</h1></header>
      <ErrorNote error={error} />
      {data && (
        <section className="card">
          <h2>Connections</h2>
          <p className="muted small">These are set in the server's <code>.env</code> file. Secrets are never shown here.</p>
          <dl className="facts">
            <div><dt>WhatsApp</dt><dd>{data.whatsapp.provider === 'meta' ? `Meta Cloud API · number id ${data.whatsapp.phoneNumberId ?? 'missing'} · token ${data.whatsapp.tokenSet ? 'set' : 'missing'}` : 'Mock (test mode — nothing is really sent)'}</dd></div>
            <div><dt>WhatsApp webhook URL</dt><dd><code>{data.whatsapp.webhookUrl}</code> · verify token {data.whatsapp.verifyTokenSet ? 'set' : 'missing'} · app secret {data.whatsapp.appSecretSet ? 'set' : 'missing'}</dd></div>
            <div><dt>Email sending</dt><dd>{data.email.provider === 'smtp' ? `SMTP ${data.email.smtpHost} as ${data.email.from}` : 'Mock (test mode — nothing is really sent)'}</dd></div>
            <div><dt>Email replies</dt><dd>{data.email.imapEnabled ? `Reading ${data.email.imapHost}` : 'Off (IMAP not enabled)'}</dd></div>
            <div><dt>Google Sheets</dt><dd>{data.googleServiceAccount ? 'Service account (private sheets OK)' : 'Public link sharing only'}</dd></div>
            <div><dt>Failure reports go to</dt><dd>{data.adminNotifyEmails.join(', ') || 'Nobody — set ADMIN_NOTIFY_EMAILS'}</dd></div>
            <div><dt>Time zone</dt><dd>{data.timezone}</dd></div>
            <div><dt>Default country code</dt><dd>{data.defaultCountryCode ? `+${data.defaultCountryCode}` : 'Not set'}</dd></div>
          </dl>
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Send a test</h2>
          <form onSubmit={sendTest} className="stack">
            <select value={t.channel} onChange={(e) => setT({ ...t, channel: e.target.value })}><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select>
            <input value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} placeholder={t.channel === 'email' ? 'you@example.com' : '+63 917 123 4567'} required />
            {t.channel === 'whatsapp' && <input value={t.template_name} onChange={(e) => setT({ ...t, template_name: e.target.value })} placeholder="Template name, e.g. hello_world (needed for first contact)" />}
            <Feedback action={test} />
            <button className="primary" disabled={test.busy}>Send test</button>
          </form>
        </section>
        <section className="card">
          <h2>Change password</h2>
          <form onSubmit={changePw} className="stack">
            <input type="password" autoComplete="current-password" placeholder="Current password" value={p.current} onChange={(e) => setP({ ...p, current: e.target.value })} required />
            <input type="password" autoComplete="new-password" placeholder="New password (12+ characters)" value={p.next} onChange={(e) => setP({ ...p, next: e.target.value })} minLength={12} required />
            <Feedback action={pw} />
            <button disabled={pw.busy}>Change password</button>
          </form>
        </section>
      </div>
    </div>
  );
}
