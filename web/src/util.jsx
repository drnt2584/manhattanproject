import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

export const CHANNEL_LABEL = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'Email', none: 'No channel' };

let chatPromise = null;
/** Chat channels switched on, in priority order, e.g. ['telegram', 'whatsapp']. */
export function useChatChannels() {
  const [chats, setChats] = useState([]);
  useEffect(() => {
    chatPromise ??= api.get('/settings/status').then((s) => s.chatChannels).catch(() => []);
    chatPromise.then(setChats);
  }, []);
  return chats;
}
export const chatLabel = (chats) => chats.map((c) => CHANNEL_LABEL[c]).join(' / ') || 'Chat';

export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtRel = (d) => {
  if (!d) return '—';
  const s = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), 'second');
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
};

/** Load data; re-load on deps change; optional polling. */
export function useLoad(fn, deps = [], pollMs = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }));
    reload();
    if (!pollMs) return undefined;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...state, reload };
}

const STATUS_TONE = {
  completed: 'ok', sent: 'ok', active: 'ok', delivered: 'ok', read: 'ok', received: 'info',
  completed_with_failures: 'warn', retrying: 'warn', skipped: 'muted', cancelled: 'muted', pending: 'info', queued: 'info', running: 'info', sending: 'info',
  failed: 'bad', accepted: 'ok', declined: 'bad',
};
const LABEL = { completed_with_failures: 'completed with failures' };

/** Text-only status badge used across the app. */
export function Badge({ value }) {
  if (!value) return null;
  return <span className={`badge tone-${STATUS_TONE[value] || 'muted'}`}>{LABEL[value] || String(value).replace(/_/g, ' ')}</span>;
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="note bad" role="alert">{error.message || String(error)}</div>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function ChannelTag({ channel }) {
  return <span className="channel">{CHANNEL_LABEL[channel] ?? 'No channel'}</span>;
}

/** Run an async action with busy state + error/success message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const run = async (fn, success) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await fn();
      if (success) setMessage(typeof success === 'function' ? success(r) : success);
      return r;
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, message, run, setError, setMessage };
}

export function Feedback({ action }) {
  return (
    <>
      <ErrorNote error={action.error} />
      {action.message && <div className="note ok" role="status">{action.message}</div>}
    </>
  );
}
