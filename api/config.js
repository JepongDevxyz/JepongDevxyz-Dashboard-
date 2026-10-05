/* ============================================================
   GET /api/config — public client config for the user dashboard.
   Returns the Supabase URL + publishable (anon) key so the browser
   can sign users in with Supabase Auth. Public by design.
   ============================================================ */

export function getPublicConfig(env) {
  const e = env || process.env;
  const supabase_url = e.SUPABASE_URL || '';
  const publishable_key = e.SUPABASE_PUBLISHABLE_KEY || '';
  if (!supabase_url || !publishable_key) return null;
  return { supabase_url, publishable_key };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const cfg = getPublicConfig();
  if (!cfg) return res.status(503).json({ error: 'Server is not configured.' });
  return res.status(200).json(cfg);
}
