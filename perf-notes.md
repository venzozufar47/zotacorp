# Perf baseline — 2026-06-10 (delete this file before merge to main)

Commit base: d2fe11a. Method notes inline so the "after" run is identical.

## Production (team.zotacorp.com), anonymous, from user machine (Indonesia)
- `x-vercel-id: sin1::iad1::...` → edge Singapore, **function iad1 (US East)**; Supabase = ap-northeast-2 (Seoul).
- TTFB `/` (login, SSR + theme RPC): 0.75 / 0.77 / **0.80 (median)** / 0.83 / 1.20 s
- TTFB `/dashboard` anon (proxy redirect only): 0.18 / 0.21 / **0.26 (median)** / 0.29 / 0.38 s
- Lighthouse mobile (login page): **perf 0.95, FCP 1.2s, LCP 2.5s, TBT 70ms, SI 4.0s, CLS 0**
- Authed TTFB (/admin, /admin/finance, /dashboard, /investor) + Speed Insights p75: PENDING user (DevTools / Vercel dashboard) — capture before merge for ground truth.

## Bundle (next build, Turbopack; gzip of chunks referenced by each route's page_client-reference-manifest.js; shared rootMainFiles NOT included)
- Shared baseline (every page): **131 KB gz** (7 files)

| Route | gz KB | chunks |
|---|---|---|
| / (login) | 110 | 8 |
| /dashboard | 197 | 13 |
| /admin | 122 | 11 |
| /admin/finance | 194 | 14 |
| /admin/finance/pnl | **306** | 17 |
| /investor | **216** | 10 |
| /investor/finance/pnl | 165 | 8 |
| /admin/yeobo-booth/bookings | 104 | 10 |
| /pos | 52 | 7 |
| /payslips | 92 | 10 |
| /admin/payslips/variables | 124 | 12 |
| /cash_semarang | 36 | 5 |

- recharts chunk: **102 KB gz** (355 KB raw), present twice (`0lluaghgiw5bv.js`, `0xx8tsj.ublqo.js`) — eagerly loaded by the pnl/investor/yeobo-booth chart routes. Fix 5 target.

## Expected wins
1. Region icn1: every server-side Supabase RTT ~200ms → ~2ms; authed TTFB −0.6–1.5s.
2. recharts dynamic: −~102KB gz initial JS on 4 routes.
3. Theme sweep: 15 font preloads → ~6; −1 RPC (`get_ui_theme`) on EVERY request incl. login.
