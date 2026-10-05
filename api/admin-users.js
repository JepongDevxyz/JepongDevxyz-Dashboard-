/* ============================================================
   GET /api/admin-users?q= — owner-only user search for the
   credit-adjust panel. Matches email (case-insensitive),
   returns up to 20 users with their live credit balance.
   ============================================================ */
import { requireAdmin } from '../lib/admin-auth.js';
import { sbRpc, listAuthUsers } from '../lib/sb.js';

export async function searchUsers(q, maxPages) {
  const users = await listAuthUsers(maxPages || 3, 1000);
  const needle = String(q || '').toLowerCase();
  const hits = users
    .filter((u) => String(u.email || '').toLowerCase().includes(needle))
    .slice(0, 20);
  for (const h of hits) {
    try {
      const b = await sbRpc('credit_balance', { uid: h.id });
      h.balance = Number(b) || 0;
    } catch {
      h.balance = null;
    }
  }
  return hits.map((h) => ({
    id: h.id,
    email: h.email || '',
    created_at: h.created_at || null,
    last_sign_in_at: h.last_sign_in_at || null,
    balance: h.balance === undefined ? null : h.balance,
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireAdmin(req, res)) return;

  const q = String((req.query && req.query.q) || '').trim();
  if (q.length < 2) {
    return res
      .status(400)
      .json({ error: 'Mag-type ng hindi bababa sa 2 characters.' });
  }

  try {
    const users = await searchUsers(q);
    return res.status(200).json({ users });
  } catch {
    return res.status(502).json({ error: 'Database error.' });
  }
}
