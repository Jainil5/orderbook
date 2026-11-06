# Remaining security risks

## OB-002 — Row Level Security (Critical) — Manual

**Why not auto-fixed:** Policies live in Supabase, not in this repo. Weakening RLS to “make the app work” would be unsafe.

**Action:** In Supabase SQL editor, enable RLS on all tenant tables and apply policies from `docs/SUPABASE_RLS_RECOMMENDED.sql`. Test with two brands: user A must never read/write brand B rows via PostgREST or anon key.

**Priority:** P0 before production.

---

## OB-007 — Transitive dependency vulnerabilities (Resolved)

**Remediation:** Upgraded `jspdf` to `^4.2.1` with patched `dompurify` and modern PDF generation. High and critical vulnerabilities resolved; `npm audit --audit-level=high` passes cleanly in CI.

**Status:** Resolved.

---

## OB-013 — In-memory rate limits (Medium)

**Why not auto-fixed:** Requires Redis/Upstash or edge rate limiting infrastructure.

**Action:** Add shared rate limit store for login and quote accept on production (Vercel/Railway compatible).

**Priority:** P2.

---

## OB-006 — `accept_quote_by_token` (Medium / High if RLS weak)

**Why not fully fixed in app:** RPC is intentionally callable by `anon`; security depends on token secrecy + DB policies preventing arbitrary order updates.

**Action:** Ensure no broad `UPDATE` on `orders` for anon; only the RPC path. Consider logging accepts to an audit table.

**Priority:** P1 with RLS work.

---

## Demo workspace on production (Low)

**Why not removed:** Product feature for prospects.

**Action:** If production should not allow demo, gate `/demo` redirects and demo cookie behind `ALLOW_DEMO=0` or block in middleware when `NODE_ENV=production`.

**Priority:** P3 (business decision).

---

## `create_order` RPC vs table fallback (Medium)

**Why not fixed:** Schema/RPC owned by DB operator.

**Action:** Prefer RPC for atomic pricing/stock/discount validation. Table fallback in `submitOrderViaTables` should not be used in production without equivalent checks.

**Priority:** P1.

---

## Penetration test gaps (Informational)

No automated IDOR tests against live Supabase were run (no credentials in audit environment). Schedule staged pen test after RLS deployment.
