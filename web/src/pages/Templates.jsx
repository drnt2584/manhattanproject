import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Empty, ErrorNote, Feedback, useAction, useLoad } from '../util.jsx';

const BLANK = {
  status_key: '', label: '', wa_enabled: true, wa_body: 'Hi {{name}}, your balance is {{amount}}.', wa_template_name: '', wa_language: 'en_US',
  wa_params: ['name', 'amount'], email_enabled: true, email_subject: 'Your balance: {{amount}}', email_body: 'Dear {{name}},\n\nYour current balance is {{amount}}.\n\nThank you.',
};

function Editor({ initial, statuses, onSaved, onCancel }) {
  const [t, setT] = useState(() => ({ ...BLANK, ...initial, wa_template_name: initial.wa_template_name || '' }));
  const [preview, setPreview] = useState(null);
  const [contactId, setContactId] = useState('');
  const act = useAction();
  const set = (k) => (e) => setT({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  useEffect(() => {
    const h = setTimeout(() => {
      api.post('/templates/preview', {
        wa_body: t.wa_body, email_subject: t.email_subject, email_body: t.email_body,
        wa_template_name: t.wa_template_name || null, wa_params: t.wa_params, contact_id: contactId ? Number(contactId) : undefined,
      }).then(setPreview).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [t.wa_body, t.email_subject, t.email_body, t.wa_template_name, t.wa_params, contactId]);

  const save = (e) => {
    e.preventDefault();
    const body = { ...t, wa_template_name: t.wa_template_name.trim() || null };
    delete body.id; delete body.created_at; delete body.updated_at;
    act.run(() => (initial.id ? api.put(`/templates/${initial.id}`, body) : api.post('/templates', body))).then((r) => r && onSaved());
  };

  return (
    <form className="card editor" onSubmit={save}>
      <h2>{initial.id ? `Edit template: ${initial.status_key}` : 'New template'}</h2>
      <div className="grid-2">
        <label>Status type (must match the sheet's Status column)
          <input list="status-options" value={t.status_key} onChange={set('status_key')} placeholder="e.g. overdue — or * for all other statuses" required />
          <datalist id="status-options">{statuses.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>Label (optional)<input value={t.label} onChange={set('label')} placeholder="Overdue payment notice" /></label>
      </div>

      <div className="grid-2 gap-top">
        <fieldset>
          <legend><label className="inline"><input type="checkbox" checked={t.wa_enabled} onChange={set('wa_enabled')} /> WhatsApp</label></legend>
          <label>Meta-approved template name
            <input value={t.wa_template_name} onChange={set('wa_template_name')} placeholder="payment_reminder" disabled={!t.wa_enabled} />
          </label>
          <p className="muted small">WhatsApp only delivers business-started messages that use a template approved in Meta Business Manager. Leave blank only for testing.</p>
          <div className="grid-2">
            <label>Language code<input value={t.wa_language} onChange={set('wa_language')} disabled={!t.wa_enabled} /></label>
            <label>Variables for {'{{1}}, {{2}}…'}
              <input value={t.wa_params.join(', ')} onChange={(e) => setT({ ...t, wa_params: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} disabled={!t.wa_enabled} />
            </label>
          </div>
          <label>Message text (same wording as the approved template)
            <textarea rows={6} value={t.wa_body} onChange={set('wa_body')} disabled={!t.wa_enabled} />
          </label>
        </fieldset>
        <fieldset>
          <legend><label className="inline"><input type="checkbox" checked={t.email_enabled} onChange={set('email_enabled')} /> Email</label></legend>
          <label>Subject<input value={t.email_subject} onChange={set('email_subject')} disabled={!t.email_enabled} /></label>
          <label>Body<textarea rows={10} value={t.email_body} onChange={set('email_body')} disabled={!t.email_enabled} /></label>
        </fieldset>
      </div>

      <section className="preview gap-top">
        <div className="toolbar">
          <h3>Preview</h3>
          <label className="inline">Contact id <input className="narrow" value={contactId} onChange={(e) => setContactId(e.target.value.replace(/\D/g, ''))} placeholder="sample" /></label>
        </div>
        {preview && (
          <>
            <p className="muted small">Available variables: {preview.variables.map((v) => <code key={v}>{`{{${v}}}`}</code>)}</p>
            <div className="grid-2">
              <div className="bubble">
                <div className="muted small">WhatsApp</div>
                <pre>{preview.whatsapp.text}</pre>
                {preview.whatsapp.params && <div className="small muted">Template params: {preview.whatsapp.params.map((p, i) => `{{${i + 1}}}=${p}`).join(', ')}</div>}
                {preview.whatsapp.missing.length > 0 && <div className="note warn small">No value for: {preview.whatsapp.missing.join(', ')}</div>}
              </div>
              <div className="bubble">
                <div className="muted small">Email</div>
                <strong>{preview.email.subject}</strong>
                <pre>{preview.email.body}</pre>
                {preview.email.missing.length > 0 && <div className="note warn small">No value for: {preview.email.missing.join(', ')}</div>}
              </div>
            </div>
          </>
        )}
      </section>

      <Feedback action={act} />
      <div className="actions">
        <button className="primary" disabled={act.busy}>Save template</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function Templates() {
  const list = useLoad(() => api.get('/templates'), []);
  const st = useLoad(() => api.get('/sources/statuses'), []);
  const [editing, setEditing] = useState(null);
  const del = useAction();
  const statuses = (st.data?.statuses || []).map((s) => s.status).filter(Boolean);
  const missing = (st.data?.statuses || []).filter((s) => s.status && !s.template_id && !(list.data?.templates || []).some((t) => t.status_key === '*'));

  const remove = (t) => {
    if (!window.confirm(`Delete the template for "${t.status_key}"?`)) return;
    del.run(() => api.del(`/templates/${t.id}`)).then(() => { list.reload(); st.reload(); });
  };

  if (editing) {
    return <div className="page"><Editor initial={editing} statuses={statuses} onSaved={() => { setEditing(null); list.reload(); st.reload(); }} onCancel={() => setEditing(null)} /></div>;
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Templates</h1>
        <button className="primary" onClick={() => setEditing({})}>New template</button>
      </header>
      <p className="muted">One template per status type. Use <code>{'{{name}}'}</code>, <code>{'{{amount}}'}</code>, <code>{'{{amount_formatted}}'}</code> or any sheet column. A template with status <code>*</code> is used for statuses without their own template.</p>
      {missing.length > 0 && (
        <div className="note warn">
          Statuses without a template: {missing.map((s) => (
            <button key={s.status} className="link" onClick={() => setEditing({ status_key: s.status })}>{s.status}</button>
          ))}
        </div>
      )}
      <ErrorNote error={list.error || del.error} />
      {list.data?.templates?.length === 0 && <Empty>No templates yet.</Empty>}
      <div className="cards">
        {list.data?.templates?.map((t) => (
          <article key={t.id} className="card">
            <div className="toolbar">
              <h2>{t.status_key === '*' ? 'All other statuses (*)' : t.status_key}</h2>
              <span className="muted">{t.label}</span>
            </div>
            <div className="grid-2">
              <div>
                <div className="muted small">WhatsApp {t.wa_enabled ? (t.wa_template_name ? `· template ${t.wa_template_name}` : '· free text (testing only)') : '· off'}</div>
                {t.wa_enabled && <pre className="snippet">{t.wa_body}</pre>}
              </div>
              <div>
                <div className="muted small">Email {t.email_enabled ? '' : '· off'}</div>
                {t.email_enabled && <pre className="snippet"><b>{t.email_subject}</b>{'\n'}{t.email_body}</pre>}
              </div>
            </div>
            <div className="actions">
              <button onClick={() => setEditing(t)}>Edit</button>
              <button className="danger" onClick={() => remove(t)}>Delete</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
