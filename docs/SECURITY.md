# Security model (OrderBook)

Defense in depth — **Supabase RLS is the authority**; the app adds transport and input guardrails.

## Secrets

- Only `NEXT_PUBLIC_*` Supabase URL + **publishable** key in the browser.
- `BRAND_AUTH_EMAIL_MAP` and any future DB credentials stay **server-only** (`.env.local`, Railway).
- `.env.local` is gitignored; never commit passwords or `service_role` keys.

## Authentication

- Login maps **brand code → auth email on the server** only (`BRAND_AUTH_EMAIL_MAP` or future RPC).
- Active brand comes from `brand_members`, never from client-supplied `brand_id`.
- Brute-force mitigation: per-IP rate limit on sign-in server action.
- Generic error copy on failed password (no account enumeration).

## Authorization

- Middleware refreshes Supabase session and blocks private routes without a user.
- Demo routes use fixture data only — no live session or service role.
- Live data services call `loadLiveWorkspace()` and filter by membership-derived `brand_id`.

## Input & queries

- Search terms escaped before `ilike` filters (PostgREST injection hardening).
- Order/list filters restricted to allowlists; pagination capped.
- Order creation goes through `create_order` RPC when enabled (server-validated totals).

## HTTP hardening

- Security headers on all responses (frame deny, nosniff, referrer policy, etc.).
- `poweredByHeader` disabled.
- Server Actions body size limited.

## Local development

1. `npm run setup:env` → creates `.env.local` from `.env.example`
2. Fill publishable key + optional `BRAND_AUTH_EMAIL_MAP`
3. `npm run dev` (runs env check first)

Replace in-memory rate limits with Redis/edge limits for multi-instance production if needed.

## Security audit & reports

- [Security Audit Report](./SECURITY_AUDIT.md) — Comprehensive vulnerability analysis & methodology
- [Security Checklist](./SECURITY_CHECKLIST.md) — Verification checklist before production rollout
- [Security Fixes](./SECURITY_FIXES.md) — Remediation details and code changes
- [Remaining Security Risks](./SECURITY_REMAINING_RISKS.md) — Open risks and external infrastructure dependencies
- [Recommended Supabase RLS](./SUPABASE_RLS_RECOMMENDED.sql) & [Apply Script](./SUPABASE_RLS_APPLY.sql) — Tenant isolation policies
- [Supabase Extensions & RPCs](./SUPABASE_EXTENSIONS.sql) — Required database functions
