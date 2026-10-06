import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError } from './lib/errors.js';

export const COOKIE = 'notify_session';

export function issueSession(res, admin) {
  const token = jwt.sign({ sub: admin.id }, config.sessionSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', maxAge: config.sessionHours * 3600_000, path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAdmin(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new HttpError(401, 'Not signed in'));
  let payload;
  try {
    payload = jwt.verify(token, config.sessionSecret);
  } catch {
    return next(new HttpError(401, 'Session expired'));
  }
  const { rows } = await query('SELECT id, email, name FROM admins WHERE id = $1', [payload.sub]);
  if (!rows.length) return next(new HttpError(401, 'Account not found'));
  req.admin = rows[0];
  next();
}

/** Blocks cross-site form posts: state-changing API calls must be JSON or multipart from our own origin. */
export function requireSameOrigin(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== config.publicUrl && !(!config.isProd && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
    return next(new HttpError(403, 'Cross-origin request blocked'));
  }
  if (req.get('x-requested-with') !== 'notify') return next(new HttpError(403, 'Missing X-Requested-With header'));
  next();
}

export const actor = (req) => `admin:${req.admin.email}`;
