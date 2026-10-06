import React, { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Contacts from './pages/Contacts.jsx';
import Templates from './pages/Templates.jsx';
import Schedules from './pages/Schedules.jsx';
import Runs from './pages/Runs.jsx';
import RunDetail from './pages/RunDetail.jsx';
import Inbox from './pages/Inbox.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  ['/', 'Dashboard'],
  ['/contacts', 'Contacts & source'],
  ['/templates', 'Templates'],
  ['/schedules', 'Send & schedule'],
  ['/runs', 'Send history'],
  ['/inbox', 'Replies'],
  ['/audit', 'Audit log'],
  ['/settings', 'Settings'],
];

export default function App() {
  const [admin, setAdmin] = useState(undefined);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => setAdmin(null));
    api.get('/auth/me').then((r) => setAdmin(r.admin)).catch(() => setAdmin(null));
  }, []);

  useEffect(() => {
    if (!admin) return undefined;
    const load = () => api.get('/dashboard').then((d) => setUnread(d.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [admin]);

  if (admin === undefined) return <div className="boot">Loading…</div>;
  if (!admin) return <Login onLogin={(a) => { setAdmin(a); navigate('/'); }} />;

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setAdmin(null);
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Notify</div>
        <nav>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
              {to === '/inbox' && unread > 0 && <span className="count">{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <div className="muted small">{admin.email}</div>
          <button className="link" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/runs" element={<Runs />} />
          <Route path="/runs/:id" element={<RunDetail />} />
          <Route path="/inbox" element={<Inbox onRead={() => api.get('/dashboard').then((d) => setUnread(d.unread)).catch(() => {})} />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
