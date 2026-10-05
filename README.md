# JepongDevxyz Dashboard

Standalone dashboard site para sa JepongDevxyz AI — **hiwalay na repo at site** mula sa main app. Isang repo, dalawang sections:

- `/app/main/admin/` — **Owner Admin Dashboard** (ikaw lang). Password-gated, hindi naka-link kahit saan. Kita: total users, bagong sign-ups, PayMongo revenue, credits granted, usage (words/queries), guests per day (14-day chart), goals, top-10 users, at **Credit adjust** panel (magdagdag/magbawas ng credits sa kahit sinong user).
- `/app/main/users/` — **User Dashboard**. Ang users magsa-sign in gamit ang kanilang JepongDevxyz AI account (same Supabase Auth). Kita nila: credit balance, total credited, words/queries, goals progress, top-up history.
- `/` — simpleng landing na may link lang sa User Dashboard (walang admin link).

## Setup (Vercel)

1. **Import repo to Vercel** bilang bagong project (hal. `jepongdevxyz-dashboard`).
2. **Env vars** (Project → Settings → Environment Variables):
   - `SUPABASE_URL` — same Supabase project ng main app
   - `SUPABASE_PUBLISHABLE_KEY` — anon/publishable key (ginagamit ng user sign-in at JWT verify)
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key (server-side lang; hindi kailanman napupunta sa browser)
   - `ADMIN_PASSWORD` — ikaw lang ang nakakaalam; ito ang password sa `/app/main/admin/`
3. **Deploy.**
4. Buksan ang `/app/main/users` — i-share ang link sa users mo.
5. Buksan ang `/app/main/admin` — **i-bookmark mo; hindi ito naka-link sa kahit saang page.**

## API routes

| Route | Para saan |
|---|---|
| `GET /api/config` | Public Supabase URL + publishable key para sa user sign-in |
| `POST /api/admin-login` | Admin password → `jd_admin` HttpOnly session cookie (7 days). `{action:"logout"}` para mag-logout |
| `GET /api/admin-login` | Session check |
| `GET /api/admin-stats` | Aggregated metrics (owner only) |
| `GET /api/admin-users?q=` | User search by email (owner only) |
| `POST /api/admin-credit` | Manual credit adjust `{target, delta, reason}` (owner only) |
| `GET /api/user-stats` | Sariling stats ng naka-sign in na user (Bearer JWT) |

## Security notes

- Ang admin session ay HMAC-signed cookie (`jd_admin`); ang password ay tinitingnan gamit ang `timingSafeEqual`.
- Ang service role key ay server-side lang. Ang browser ay nakakakita lang ng publishable key.
- Lahat ng admin routes ay naka-`requireAdmin`; lahat ng user-stats queries ay naka-scope sa verified `user_id`.
- Walang sikreto ang naka-log kahit saan.

## Tech

- Plain HTML/CSS/JS, dark navy theme, Lucide icons (CDN), mobile-first.
- Vercel Node serverless functions (`export default async function handler(req, res)`).
- `vercel.json`: `{"cleanUrls": true}` — ang `app/main/admin/index.html` ay nase-serve sa `/app/main/admin/`.
