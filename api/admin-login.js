/* ============================================================
   JepongDevxyz Dashboard — admin login / session.
   POST /api/admin-login { password }        -> sets jd_admin cookie
   POST /api/admin-login { action:"logout" } -> clears cookie
   GET  /api/admin-login                     -> { ok:true } if session valid
   Password is compared with timingSafeEqual. Nothing secret is logged.
   ============================================================ */
import {
  signSession,
  verifySession,
  safeEqual,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from '../lib/admin-auth.js';

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'Server is not configured.' });
  }

  if (req.method === 'GET') {
    const ok = verifySession(req.headers && req.headers.cookie, ADMIN_PASSWORD);
    return ok
      ? res.status(200).json({ ok: true })
      : res.status(401).json({ ok: false });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const body = readBody(req);

  if (body.action === 'logout') {
    res.setHeader('Set-Cookie', clearSessionCookieHeader());
    return res.status(200).json({ ok: true });
  }

  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Maling password.' });
  }

  res.setHeader('Set-Cookie', sessionCookieHeader(signSession(ADMIN_PASSWORD)));
  return res.status(200).json({ ok: true });
}
