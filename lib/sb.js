/* ============================================================
   JepongDevxyz Dashboard — Supabase REST helpers (service role).
   All calls use global fetch with a 10s timeout. Never logs keys.
   ============================================================ */

export function sbBase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const e = new Error('Server is not configured.');
    e.status = 503;
    throw e;
  }
  return { base: url.replace(/\/+$/, ''), key };
}

function serviceHeaders(key, extra) {
  return Object.assign(
    {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    extra || {}
  );
}

export async function sbFetch(path, opts) {
  const { base, key } = sbBase();
  const o = opts || {};
  const r = await fetch(base + path, {
    method: o.method || 'GET',
    headers: serviceHeaders(key, o.headers),
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error('Database error.');
    e.status = 502;
    throw e;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function sbRpc(fn, args) {
  return sbFetch('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} });
}

/*
 * List Supabase Auth users via the admin API.
 * Returns a flat array of user objects. Paginates up to maxPages.
 */
export async function listAuthUsers(maxPages, perPage) {
  const { base, key } = sbBase();
  const pages = maxPages || 5;
  const per = perPage || 1000;
  const users = [];
  for (let page = 1; page <= pages; page++) {
    const r = await fetch(
      base + '/auth/v1/admin/users?per_page=' + per + '&page=' + page,
      {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!r.ok) {
      const e = new Error('Auth admin error.');
      e.status = 502;
      throw e;
    }
    const data = await r.json();
    const arr = Array.isArray(data) ? data : data.users || [];
    users.push(...arr);
    if (arr.length < per) break;
  }
  return users;
}
