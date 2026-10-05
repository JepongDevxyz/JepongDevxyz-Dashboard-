/* ============================================================
   JepongDevxyz Dashboard — shared admin session helpers.
   Used by api/admin-login.js, api/admin-stats.js,
   api/admin-credit.js, api/admin-users.js.
   Cookie: jd_admin=<payload>.<sig>
     payload = base64url(JSON.stringify({ exp }))
     sig     = HMAC_SHA256(ADMIN_PASSWORD, payload) hex
   Never log secrets, passwords, or raw cookie values.
   ============================================================ */
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'jd_admin';
const SESSION_MS = 7 * 864e5; // 7 days

export function getCookieName() {
  return COOKIE_NAME;
}

/* Timing-safe string compare. Returns false for non-strings. */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/* Create a fresh signed session token. */
export function signSession(adminPassword) {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_MS })
  ).toString('base64url');
  const sig = createHmac('sha256', adminPassword).update(payload).digest('hex');
  return payload + '.' + sig;
}

/* Verify the session cookie from a Cookie header string. */
export function verifySession(cookieHeader, adminPassword) {
  if (!cookieHeader || !adminPassword) return false;
  const m = new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '=([^;]+)').exec(cookieHeader);
  if (!m) return false;
  const token = m[1].trim();
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', adminPassword).update(payload).digest('hex');
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

export function sessionCookieHeader(token) {
  return (
    COOKIE_NAME +
    '=' +
    token +
    '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800'
  );
}

export function clearSessionCookieHeader() {
  return COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
}

/*
 * Express/Vercel-style guard. Returns true when the request carries a
 * valid admin session; otherwise sends 401/503 and returns false.
 */
export function requireAdmin(req, res, adminPassword) {
  const pw = adminPassword !== undefined ? adminPassword : process.env.ADMIN_PASSWORD;
  if (!pw) {
    res.status(503).json({ error: 'Server is not configured.' });
    return false;
  }
  const cookieHeader = req && req.headers ? req.headers.cookie : '';
  if (!verifySession(cookieHeader, pw)) {
    res.status(401).json({ error: 'Not authorized.' });
    return false;
  }
  return true;
}
