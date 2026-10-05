/* ============================================================
   GET /api/admin-stats — owner-only aggregated dashboard metrics.
   Auth: jd_admin session cookie (see lib/admin-auth.js).
   Every data source is fetched with allSettled semantics: one
   failing source yields null for that section, never a 500.
   (Auth failure is the only hard error.)
   ============================================================ */
import { requireAdmin } from '../lib/admin-auth.js';
import { sbFetch, sbRpc, listAuthUsers } from '../lib/sb.js';

const DAY = 864e5;

/* ---------- pure summarizers (importable for tests) ---------- */

export function summarizeUsers(users, now) {
  const t = now === undefined ? Date.now() : now;
  return {
    total: users.length,
    new_7d: users.filter(
      (u) => u.created_at && t - Date.parse(u.created_at) <= 7 * DAY
    ).length,
    new_30d: users.filter(
      (u) => u.created_at && t - Date.parse(u.created_at) <= 30 * DAY
    ).length,
  };
}

export function summarizeRevenue(payments) {
  const paid = (payments || []).filter((p) => p.status === 'paid');
  const total_php =
    paid.reduce((s, p) => s + (Number(p.amount_centavos) || 0), 0) / 100;
  const by_plan = {};
  for (const p of paid) {
    const k = p.plan_id || 'unknown';
    if (!by_plan[k]) by_plan[k] = { count: 0, total_php: 0 };
    by_plan[k].count += 1;
    by_plan[k].total_php += (Number(p.amount_centavos) || 0) / 100;
  }
  return { total_php, topups: paid.length, by_plan };
}

export function summarizeCredits(ledger) {
  const rows = ledger || [];
  const granted_total = rows.reduce((s, r) => s + (Number(r.delta) || 0), 0);
  const by_reason = {};
  for (const r of rows) {
    const k = r.reason || 'unknown';
    by_reason[k] = (by_reason[k] || 0) + (Number(r.delta) || 0);
  }
  return { granted_total, by_reason };
}

export function summarizeUsage(usage, users) {
  const rows = usage || [];
  const words = rows.reduce((s, r) => s + (Number(r.words) || 0), 0);
  const queries = rows.reduce((s, r) => s + (Number(r.queries) || 0), 0);
  const emailById = {};
  if (users) {
    for (const u of users) emailById[u.id] = u.email || '';
  }
  const top = [...rows]
    .sort((a, b) => (Number(b.words) || 0) - (Number(a.words) || 0))
    .slice(0, 10)
    .map((r) => ({
      user_id: r.user_id,
      email: emailById[r.user_id] || '',
      words: Number(r.words) || 0,
      queries: Number(r.queries) || 0,
      balance: null,
    }));
  return { words, queries, top };
}

/*
 * Group guest_credits rows into the last 14 days.
 * The day column name is UNKNOWN, so we discover it dynamically:
 * prefer a column literally named day/date/credit_day, else any
 * column whose value looks like YYYY-MM-DD or an ISO datetime.
 * Returns { days:[{day,active}] } or null when nothing usable exists.
 */
export function groupGuestDays(rows, now) {
  if (!rows || !rows.length) return null;
  const t = now === undefined ? Date.now() : now;
  const sample = rows[0];
  const keys = Object.keys(sample);
  let dayKey =
    keys.find((k) => /^(day|date|credit_day)$/i.test(k)) ||
    keys.find((k) => {
      const v = sample[k];
      return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
    });
  if (!dayKey) return null;
  const counts = {};
  for (const r of rows) {
    const v = r[dayKey];
    if (typeof v !== 'string') continue;
    const day = v.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    counts[day] = (counts[day] || 0) + 1;
  }
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(t - i * DAY).toISOString().slice(0, 10);
    days.push({ day, active: counts[day] || 0 });
  }
  return { days };
}

export function summarizeGoals(goals) {
  const rows = goals || [];
  const completed = rows.filter((g) => g.status === 'completed').length;
  return { total: rows.length, active: rows.length - completed, completed };
}

export function summarizeStats(sources, now) {
  const s = sources || {};
  return {
    users: s.users ? summarizeUsers(s.users, now) : null,
    revenue: s.payments ? summarizeRevenue(s.payments) : null,
    credits: s.ledger ? summarizeCredits(s.ledger) : null,
    usage: s.usage ? summarizeUsage(s.usage, s.users) : null,
    guests: s.guests ? groupGuestDays(s.guests, now) : null,
    goals: s.goals ? summarizeGoals(s.goals) : null,
  };
}

/* ---------- handler ---------- */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!requireAdmin(req, res)) return;

  const jobs = {
    users: () => listAuthUsers(5, 1000),
    payments: () =>
      sbFetch(
        '/rest/v1/paymongo_payments?select=user_id,plan_id,amount_centavos,credits,status,paid_at&limit=5000'
      ),
    ledger: () => sbFetch('/rest/v1/credit_ledger?select=delta,reason&limit=5000'),
    usage: () =>
      sbFetch('/rest/v1/usage_stats?select=user_id,words,queries&limit=5000'),
    // guest_credits columns are unknown: fetch raw, group by day in JS.
    guests: () => sbFetch('/rest/v1/guest_credits?select=*&limit=5000'),
    goals: () => sbFetch('/rest/v1/goals?select=id,status&limit=5000'),
  };

  const results = {};
  await Promise.all(
    Object.entries(jobs).map(async ([k, fn]) => {
      try {
        results[k] = await fn();
      } catch {
        results[k] = null;
      }
    })
  );

  const stats = summarizeStats(results);

  // Attach live balances to the top-10 users (best-effort per user).
  if (stats.usage && stats.usage.top) {
    await Promise.all(
      stats.usage.top.map(async (t) => {
        try {
          const b = await sbRpc('credit_balance', { uid: t.user_id });
          t.balance = Number(b) || 0;
        } catch {
          t.balance = null;
        }
      })
    );
  }

  return res.status(200).json(stats);
}
