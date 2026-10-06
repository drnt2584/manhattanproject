import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query } from '../db.js';
import { issueSession, clearSession, requireAdmin, actor } from '../auth.js';
import { audit } from '../services/audit.js';
import { HttpError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';

const r = Router();
// Real hash of a random string, compared when the account doesn't exist so timing doesn't reveal valid emails
const DUMMY_HASH = bcrypt.hashSync(String(Math.random()), 12);
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

r.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
  const { rows } = await query('SELECT * FROM admins WHERE email = $1', [email.toLowerCase()]);
  const admin = rows[0];
  const ok = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH);
  if (!admin || !ok) {
    await audit({ event: 'login_failed', actor: `anonymous:${req.ip}`, details: { email } });
    throw new HttpError(401, 'Wrong email or password');
  }
  await query('UPDATE admins SET last_login_at = now() WHERE id = $1', [admin.id]);
  await audit({ event: 'login', actor: `admin:${admin.email}`, details: { ip: req.ip } });
  issueSession(res, admin);
  res.json({ admin: { id: admin.id, email: admin.email, name: admin.name } });
});

r.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

r.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

r.post('/password', requireAdmin, async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string(), next: z.string().min(12, 'Use at least 12 characters') }), req.body);
  const { rows: [a] } = await query('SELECT password_hash FROM admins WHERE id = $1', [req.admin.id]);
  if (!(await bcrypt.compare(current, a.password_hash))) throw new HttpError(400, 'Current password is wrong');
  await query('UPDATE admins SET password_hash = $2 WHERE id = $1', [req.admin.id, await bcrypt.hash(next, 12)]);
  await audit({ event: 'password_changed', actor: actor(req) });
  res.json({ ok: true });
});

export default r;
