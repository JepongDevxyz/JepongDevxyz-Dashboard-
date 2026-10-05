/* ============================================================
   GET /api/user-stats — signed-in user's own dashboard data.
   Auth: Authorization: Bearer <supabase jwt> (their JepongDevxyz
   AI account token). The JWT is verified against Supabase Auth;
   every query is then scoped to that user_id server-side.
   ============================================================ */
import { sbFetch, sbRpc, sbBase } from '../lib/sb.js';

export async function verifyUserJwt(jwt, env) {
  const e = env || process.env;
  const url = e.SUPABASE_URL;
  const key = e.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !jwt) return null;
  const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + jwt },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  try {
    const d = await r.json();
    return d && d.id ? d : null;
  } catch {
    return null;
  }
}

/* Pure summarizer (importable for tests). */
export function summarizeUserStats(sources) {
  const s = sources || {};
  const ledger = s.ledger || [];
  const total_credited = ledger.reduce(
    (sum, r) => sum + Math.max(0, Number(r.delta) || 0),
    0
  );
  const goals = s.goals || [];
  const activeGoals = goals.filter((g) => g.status !== 'completed');
  const completedGoals = goals.filter((g) => g.status === 'completed');
  const avg_progress = activeGoals.length
    ? Math.round(
        activeGoals.reduce((sum, g) => sum + (Number(g.progress) || 0), 0) /
          activeGoals.length
      )
    : 0;
  return {
    balance: Number(s.balance) || 0,
    total_credited,
    usage: {
      words: Number(s.usage && s.usage.words) || 0,
      queries: Number(s.usage && s.usage.queries) || 0,
    },
    goals: {
      active: activeGoals.length,
      completed: completedGoals.length,
      avg_progress,
    },
    topups: (s.topups || []).map((t) => ({
      plan: t.plan_id || 'unknown',
      amount_php: (Number(t.amount_centavos) || 0) / 100,
      credits: Number(t.credits) || 0,
      status: t.status || 'unknown',
      date: t.paid_at || t.created_at || null,
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const auth = (req.headers && req.headers.authorization) || '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  let user = null;
  try {
    user = await verifyUserJwt(jwt);
  } catch {
    user = null;
  }
  if (!user) {
    return res.status(401).json({ error: 'Kailangan mag-sign in.' });
  }

  // Touch sbBase so missing server config fails loudly, not silently.
  try {
    sbBase();
  } catch {
    return res.status(503).json({ error: 'Server is not configured.' });
  }

  const uid = 'user_id=eq.' + encodeURIComponent(user.id);
  const jobs = {
    balance: () => sbRpc('credit_balance', { uid: user.id }),
    ledger: () =>
      sbFetch('/rest/v1/credit_ledger?select=delta&' + uid + '&delta=gt.0&limit=5000'),
    usage: () => sbFetch('/rest/v1/usage_stats?select=words,queries&' + uid),
    goals: () => sbFetch('/rest/v1/goals?select=status,progress&' + uid + '&limit=1000'),
    topups: () =>
      sbFetch(
        '/rest/v1/paymongo_payments?select=plan_id,amount_centavos,credits,status,paid_at,created_at&' +
          uid +
          '&order=paid_at.desc&limit=20'
      ),
  };

  const results = {};
  await Promise.all(
    Object.entries(jobs).map(async ([k, fn]) => {
      try {
        const v = await fn();
        results[k] = k === 'usage' && Array.isArray(v) ? v[0] || null : v;
      } catch {
        results[k] = k === 'usage' ? null : k === 'balance' ? 0 : [];
      }
    })
  );

  return res.status(200).json(summarizeUserStats(results));
}
