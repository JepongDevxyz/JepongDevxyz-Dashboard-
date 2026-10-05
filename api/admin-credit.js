/* ============================================================
   POST /api/admin-credit { target, delta, reason } — owner-only
   manual credit adjustment.
   target: email address OR user UUID.
   Inserts into credit_ledger { user_id, delta, reason:"admin:<reason>" }
   then returns the fresh balance via the credit_balance(uid) RPC.
   ============================================================ */
import { requireAdmin } from '../lib/admin-auth.js';
import { sbFetch, sbRpc, listAuthUsers } from '../lib/sb.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DELTA = 100000;
const MAX_REASON = 120;

export function validateCreditInput(input) {
  const body = input || {};
  const errors = [];
  const target = String(body.target || '').trim();

  if (!target) errors.push('Ilagay ang email o user ID.');

  const rawDelta = body.delta;
  const delta =
    typeof rawDelta === 'number' ? rawDelta : Number(String(rawDelta ?? '').trim());
  if (!Number.isInteger(delta)) {
    errors.push('Ang amount ay dapat whole number.');
  } else if (delta === 0) {
    errors.push('Ang amount ay hindi pwedeng 0.');
  } else if (Math.abs(delta) > MAX_DELTA) {
    errors.push('Max 100,000 credits bawat adjust.');
  }

  const reason = String(body.reason || '').trim();
  if (!reason) {
    errors.push('Ilagay ang reason.');
  } else if (reason.length > MAX_REASON) {
    errors.push('Ang reason ay max 120 characters.');
  }

  return {
    errors,
    target,
    delta: Number.isInteger(delta) ? delta : 0,
    reason,
  };
}

/* Resolve an email (exact, case-insensitive) or UUID to { id, email }. */
export async function resolveUser(target, maxPages) {
  if (UUID_RE.test(target)) return { id: target, email: '' };
  const q = target.toLowerCase();
  const users = await listAuthUsers(maxPages || 3, 1000);
  const hit = users.find((u) => String(u.email || '').toLowerCase() === q);
  if (!hit) return null;
  return { id: hit.id, email: hit.email || '' };
}

export function ledgerRow(userId, delta, reason) {
  return { user_id: userId, delta, reason: 'admin:' + reason };
}

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireAdmin(req, res)) return;

  const { errors, target, delta, reason } = validateCreditInput(readBody(req));
  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  let user;
  try {
    user = await resolveUser(target);
  } catch {
    return res.status(502).json({ error: 'Database error.' });
  }
  if (!user) {
    return res.status(404).json({ error: 'Walang user na may ganyang email.' });
  }

  try {
    await sbFetch('/rest/v1/credit_ledger', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: ledgerRow(user.id, delta, reason),
    });
    const bal = await sbRpc('credit_balance', { uid: user.id });
    return res.status(200).json({
      ok: true,
      user_id: user.id,
      email: user.email,
      delta,
      new_balance: Number(bal) || 0,
    });
  } catch {
    return res.status(502).json({ error: 'Database error.' });
  }
}
