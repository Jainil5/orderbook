# Security model (OrderBook demo)

OrderBook ships as a self-contained product demo: no backend, no accounts, no
secrets, no environment variables. The dataset is read-only CSV in the repo;
visitor edits live in their own browser cookies. Guardrails below keep the
public surface tidy.

## Access model

- `/login` is a demo picker — choosing a business sets an **httpOnly,
  SameSite=Lax** cookie (`ob_demo_workspace`, 7-day expiry).
- Middleware redirects workspace and print routes to `/login` without that
  cookie; `/demo/*` entry links set it and redirect into the app.
- There is no authentication to bypass: every visitor is a demo "owner" of
  their own browser-scoped sandbox. No cross-visitor data exists.

## HTTP hardening

- Security headers on all responses: CSP (`default-src 'self'`, no external
  connect targets), frame deny, nosniff, strict referrer policy.
- Probe paths (`/.env`, `/wp-admin`, `/.git`, …) return 404 at the edge.
- `poweredByHeader` disabled; Server Actions body size limited to 1 MB.

## Input handling

- Public quote tokens normalized and length-checked before lookup
  (`src/lib/security/public-token.ts`).
- Brand website URLs validated as https-only; internal redirect paths
  sanitized (`safeInternalPath`) — no open redirects.
- Order/status filters restricted to allowlists; CSV export built from typed
  rows with proper cell escaping.

## Rate limiting

- Per-IP in-memory rate limit on the public quote-accept action
  (`src/lib/security/rate-limit.ts`). For multi-instance production, swap in
  a shared store (Redis/edge) — not needed for a demo deployment.

## Data

- CSVs are bundled into the server build as raw imports; nothing is read from
  or written to disk at runtime, so serverless hosts (Vercel) work unchanged.
- Demo edits persist in chunked httpOnly cookies per browser; clearing site
  data resets the sandbox to the repo dataset.

## CRM writes

The CRM is the one module that may create rows in the demo, and every write
goes through `src/services/crm-actions.ts`, which holds four rules:

- **Tenancy comes from the cookie, never the form.** `brand_id` is taken from
  the pack resolved out of the httpOnly `ob_demo_workspace` cookie; a payload
  that names somebody else's id is not honoured.
- **Foreign keys are checked on the server.** Each `*_id` field is validated
  against the merged rows the server itself reads (`knownIds`), so a browser
  cannot claim a customer, staff member, offer or segment that does not exist.
- **Numbers are re-derived, not trusted.** Amounts, points and funnel counters
  are recomputed from the validators in `src/lib/crm/*` — a signed ledger
  amount follows its `kind`, campaign counters are capped at the audience that
  consent allows right now, and a redemption is refused against the live
  balance rather than the one the page rendered.
- **Nothing leaves the browser.** No messaging provider is connected, so no
  action sends, posts or claims delivery; a campaign's counters stay zero until
  a human logs what they saw.

Review sentiment is a deterministic lexicon score, not a model call, so no
customer text is sent anywhere for analysis.

## Production schema

`docs/SUPABASE_CRM_SCHEMA.sql` records the intended Postgres shape — per-brand
tenancy, foreign keys, indexes, and row-level security policies that deny reads
outside the caller's brands and refuse a write whose `brand_id` the caller
cannot claim. The demo does not connect to a database and never executes that
file; it is the contract to implement when the CRM moves onto real storage.
