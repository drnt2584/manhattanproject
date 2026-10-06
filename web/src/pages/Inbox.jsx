import React, { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { CHANNEL_LABEL, ChannelTag, Empty, ErrorNote, Feedback, fmtDate, fmtRel, useAction, useLoad } from '../util.jsx';

function Thread({ conv, onSent, onLoaded }) {
  const { data, error, reload } = useLoad(() => api.get('/inbox/thread' + qs({ channel: conv.channel, address: conv.address })), [conv.channel, conv.address], 15_000);
  const loadedCount = data?.messages?.length;
  // The thread request marks messages read; refresh unread counts once it has returned
  useEffect(() => { if (loadedCount !== undefined) onLoaded(); }, [loadedCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const [body, setBody] = useState('');
  const act = useAction();
  const lastIn = data?.messages?.filter((m) => m.direction === 'inbound').at(-1);
  const waExpired = conv.channel === 'whatsapp' && lastIn && Date.now() - new Date(lastIn.created_at).getTime() > 24 * 3600_000;

  const send = (e) => {
    e.preventDefault();
    act.run(() => api.post('/inbox/reply', { channel: conv.channel, address: conv.address, body }), 'Reply sent.')
      .then((r) => r && (setBody(''), reload(), onSent()));
  };

  return (
    <div className="thread">
      <div className="thread-head">
        <strong>{conv.contact_name || conv.address}</strong> <ChannelTag channel={conv.channel} />
        <div className="muted small">{conv.channel === 'email' ? conv.address : conv.address.startsWith('tg:') ? 'Telegram user (has not shared number)' : `+${conv.address}`}</div>
      </div>
      <ErrorNote error={error} />
      {data?.notifications?.length > 0 && (
        <details className="small">
          <summary>Notifications sent to this contact ({data.notifications.length})</summary>
          {data.notifications.map((n, i) => <pre key={i} className="snippet">{fmtDate(n.sent_at)} · run #{n.run_id}{'\n'}{n.rendered_subject ? `${n.rendered_subject}\n` : ''}{n.rendered_body}</pre>)}
        </details>
      )}
      <div className="messages">
        {data?.messages?.map((m) => (
          <div key={m.id} className={`msg ${m.direction}`}>
            {m.subject && <div className="small"><b>{m.subject}</b></div>}
            <div className="msg-body">{m.body}</div>
            <div className="muted small">{m.direction === 'outbound' ? (m.auto ? 'Automatic reply' : `You (${m.sent_by_email || 'admin'})`) : conv.contact_name || 'Contact'} · {fmtDate(m.created_at)}</div>
          </div>
        ))}
      </div>
      {waExpired && <div className="note warn small">More than 24 hours since their last WhatsApp message — WhatsApp will only accept an approved template now, so free-text replies are blocked.</div>}
      <form onSubmit={send} className="reply">
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Reply via ${CHANNEL_LABEL[conv.channel]}…`} required />
        <Feedback action={act} />
        <button className="primary" disabled={act.busy || !body.trim() || waExpired}>Send reply</button>
      </form>
    </div>
  );
}

export default function Inbox({ onRead }) {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useLoad(() => api.get('/inbox' + qs({ unread: unreadOnly ? 1 : '' })), [unreadOnly], 15_000);
  const [sel, setSel] = useState(null);

  const pick = (c) => setSel(c);
  const refreshCounts = () => { list.reload(); onRead(); };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Replies</h1>
        <label className="inline"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Unread only</label>
      </header>
      <p className="muted">Only replies from contacts are kept here. Everything is also written to the audit log.</p>
      <ErrorNote error={list.error} />
      <div className="inbox">
        <div className="conversations card">
          {list.data?.conversations?.length === 0 && <Empty>No replies yet.</Empty>}
          {list.data?.conversations?.map((c) => (
            <button key={`${c.channel}:${c.address}`} className={`conv ${sel && sel.channel === c.channel && sel.address === c.address ? 'selected' : ''}`} onClick={() => pick(c)}>
              <div className="conv-top">
                <strong>{c.contact_name || c.address}</strong>
                {c.unread > 0 && <span className="count">{c.unread}</span>}
              </div>
              <div className="small muted"><ChannelTag channel={c.channel} /> · {fmtRel(c.last_at)}</div>
              <div className="small ellipsis">{c.last_direction === 'outbound' ? 'You: ' : ''}{c.last_body}</div>
            </button>
          ))}
        </div>
        <div className="card">
          {sel ? <Thread key={`${sel.channel}:${sel.address}`} conv={sel} onSent={() => list.reload()} onLoaded={refreshCounts} /> : <Empty>Select a conversation.</Empty>}
        </div>
      </div>
    </div>
  );
}
