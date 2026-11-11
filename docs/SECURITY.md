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
