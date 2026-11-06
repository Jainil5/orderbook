# OrderBook — Security Audit Report

**Date:** 2025-11-05  
**Scope:** Full application (Next.js 16 App Router, Supabase, demo + live modes)  
**Method:** Source review, dependency audit (`npm audit`), architecture mapping, safe local verification (`tsc --noEmit`).

## Executive summary

OrderBook follows a sound baseline: Supabase Auth for live mode, publishable (anon) key only in app code, server actions for mutations, brand scoping in queries, login rate limiting, security headers, and no committed service-role keys. Several **application-layer** gaps were found and **remediated in code** during this audit.

**Production readiness:** **Conditional pass** — live deployment requires **verified Supabase RLS policies**, **`create_order` RPC** (or hardened table policies), and **dependency upgrades** for transitive PDF/sanitizer packages. Database security cannot be fully validated from this repository alone.

## Architecture & attack surface

| Layer | Entry points |
|--------|----------------|
| **Public** | `/`, `/login`, `/quote/[token]`, static assets |
| **Authenticated** | Workspace routes under `(workspace)/`, server actions, `/print/order/[id]` |
| **Demo** | HTTP-only `orderbook_demo` cookie → full workspace without Supabase user |
| **Backend** | Supabase PostgREST + RPCs (`create_order`, `accept_quote_by_token`, `analytics_orders_snapshot`) |
| **Secrets** | `BRAND_AUTH_EMAIL_MAP` (server), `NEXT_PUBLIC_*` Supabase URL + publishable key |

**Auth flow (live):** Brand code + password → mapped email → `signInWithPassword` → `brand_members` row → session cookie (Supabase SSR).

**Authorization:** Server actions call `loadLiveWorkspace()` / `requireBrandId()` and filter by `brand_id`. **RLS must enforce the same on the database** — the app must not be the only control.

## Vulnerability register (summary)

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| OB-001 | **Critical** | Middleware skipped auth when Supabase env invalid | **Fixed** |
| OB-002 | **Critical** | RLS policies not present in repo; tenant isolation unverified | **Needs review** (manual) |
| OB-003 | **High** | Any member could change `quotation_builder_enabled` | **Fixed** |
| OB-004 | **High** | Weak `public_token` entropy (guessable quotes) | **Fixed** |
| OB-005 | **High** | Financial ops (refund, credit note, stock) without role checks | **Fixed** |
| OB-006 | **High** | `accept_quote_by_token` SECURITY DEFINER — DB must lock down `orders` | **Mitigated** (app + SQL doc) |
| OB-007 | **High** | Transitive dependency issues (`dompurify` via `jspdf`) | **Open** (upgrade path) |
| OB-008 | **Medium** | Order status changes without transition / role checks | **Fixed** |
| OB-009 | **Medium** | Manual order discount enforced only in UI | **Fixed** (server) |
| OB-010 | **Medium** | Payment method not whitelisted server-side | **Fixed** |
| OB-011 | **Medium** | Public quote fetch exposed internal fields (`notes`) | **Fixed** |
| OB-012 | **Medium** | No CSP | **Fixed** (baseline CSP) |
| OB-013 | **Medium** | In-memory rate limits (login / quote accept) | **Partial** (documented) |
| OB-014 | **Medium** | Inline script on print page | **Fixed** (`AutoPrint` client) |
| OB-015 | **Low** | Demo cookie grants owner-equivalent access | **By design** (document) |
| OB-016 | **Low** | Staff can record payments (intended for POS) | **Accepted** |
| OB-017 | **Info** | `createSupabaseServiceClient` name implied service role | **Clarified** (publishable key only) |
| OB-018 | **Info** | Example Supabase URL in README | **Info** (rotate if abused) |

**Totals:** 18 findings — **2 Critical**, **5 High**, **7 Medium**, **2 Low**, **2 Informational**.  
**Fixed in code:** 11 confirmed. **Remaining:** 7 (mostly DB ops + dependencies + demo model).

## Notable attack scenarios

1. **Missing env misconfiguration (OB-001):** Attacker browses `/dashboard` without Supabase configured → previously allowed; now redirected to login unless demo cookie or public route.
2. **Cross-tenant IDOR (OB-002):** If RLS missing, changing `orderId` in API could expose another brand’s rows — mitigated only if RLS matches app filters.
3. **Quote token guessing (OB-004):** Short tokens → accept quote / read quote — mitigated with 192-bit `base64url` tokens.
4. **Staff privilege abuse (OB-005):** Staff issuing credit notes/refunds — blocked; managers+ only.

## Verification performed

- `npx tsc --noEmit` — **PASS**
- `npm audit --audit-level=high` — **FAIL** (transitive dev/runtime deps; see OB-007)
- Live RLS penetration — **Not run** (requires your Supabase project)
- Production destructive tests — **Not run**

## Manual actions required

1. Apply and test **`docs/SUPABASE_RLS_RECOMMENDED.sql`** (or your existing policies).
2. Run **`docs/SUPABASE_EXTENSIONS.sql`**; review `accept_quote_by_token` grants.
3. Ensure **`create_order`** RPC validates prices, stock, discounts, and `brand_id`.
4. Upgrade **`jspdf`** / resolve **`dompurify`** advisory chain when compatible.
5. Configure **`BRAND_AUTH_EMAIL_MAP`** (or RPC) on production hosts only.
6. Consider **disabling demo cookie** on production (`NODE_ENV=production`) if not needed.

## Production readiness assessment

| Area | Rating |
|------|--------|
| App-layer authZ | Good (after fixes) |
| Supabase RLS | **Unknown — owner must verify** |
| Secrets handling | Good |
| Headers / CSP | Good (baseline) |
| Dependencies | Needs attention |
| **Overall** | **Ship after RLS verification + dependency plan** |
