# OrderBook

Multi-business order management and POS workspace for **WebsiteIn**. One app, one data model, every record scoped by `brand_id`.

## Stack

- Next.js App Router, React, TypeScript (strict)
- **`data/*.csv` as the live store** for the current demo — reads and writes
- Supabase Auth + PostgreSQL code is in the repo but switched off (`OB_USE_SUPABASE`); Tailwind CSS + shared `--ob-*` design tokens

## Run it locally

No secrets, no database, no migrations:

```bash
npm install
npm run dev                  # http://localhost:3000
```

`predev` prints which storage mode the app is in and only fails if
`OB_USE_SUPABASE=true` was set without keys. Open `http://localhost:3000` and
pick a brand on `/login` — **Brewery Cafe (BR-1)** or **Cubig Furniture (BR-2)**.
Everything you then see and change is a row in `data/`:

- Every screen reads `data/*.csv`; missing files are written from the fixture
  packs on first access, so a fresh checkout needs nothing.
- Edits (orders, payments, refunds, stock, customers, CRM, settings) are
  written back to the same files and survive a restart, a second browser, and
  a spreadsheet.
- Signing in is a row too — `data/sessions.csv` holds the session, the browser
  keeps only a random token whose hash is stored. Delete a row to revoke it.

`OB_DATA_DIR=/some/where` moves the whole store (tests use a temp dir).

## Railway / any host

Push it and start with no environment variables. The filesystem is ephemeral
on Railway, so writes live until the container restarts and the checked-in
CSVs seed a fresh one — which is exactly what a demo wants.

**Reaching it through a proxy, tunnel or preview host?** Every page loads, but
buttons that save say *"a server error occurred"*. That is Next.js comparing the
browser's `Origin` against the `x-forwarded-host` your gateway sends, and
aborting the Server Action when they disagree. Tell it which public origin is
legitimate and the check keeps guarding every other one:

```bash
OB_ACTION_ALLOWED_ORIGINS="*.preview.yourgateway.com"   # comma-separated
```

On a plain deployment — direct host, or a proxy that forwards the real host —
this variable is unnecessary and should stay unset.

## Environment reference

Everything here is optional while the app runs on CSVs.

| Variable | Where | Purpose |
|----------|--------|---------|
| `OB_USE_SUPABASE` | **Server only** | `true` switches live data back on; anything else keeps `data/*.csv` |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL (`*.supabase.co` only) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Publishable key (RLS-enforced) |
| `BRAND_AUTH_EMAIL_MAP` | **Server only** | JSON map of brand code → Auth email |
| `OB_DATA_DIR` | **Server only** | Where the CSV tables live (default `./data`) |
| `OB_ACTION_ALLOWED_ORIGINS` | **Server only** | Public origin(s) whose Server Actions arrive with a forwarded host — proxies, tunnels, preview gateways |

`npm run setup:env` creates `.env.local` from `.env.example` (gitignored —
never commit it). `npm run check:env` reports the current mode.

Never commit secrets or use `service_role` in the browser.

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Demo entry for both brands, plus business ID + password sign-in (Supabase only when enabled) |
| `/dashboard` … `/settings`, `/manager/*`, `/customers/*` (CRM) | The workspace, on CSV data |
| `/quote/[token]` | Public customer quote — works with no session at all |

## Demo vs live

- **Explore demo** on `/login` opens the full workspace for **Brewery Cafe (BR-1)** or **Cubig Furniture (BR-2)**; `/demo/<path>` redirects to the same entry with `next=<path>`.
- **Sign in** with a business ID uses Supabase Auth + `brand_members` and is refused while the switch is off; it clears the demo session either way.
- Billing, CRM, stock and settings are fully interactive and persist to the CSVs. With `OB_USE_SUPABASE=true` + keys, the same screens go to Postgres through RLS instead.

## Documentation

- [`docs/CSV_DATA.md`](docs/CSV_DATA.md) — the CSV store: all 39 tables, seeding, writes, sessions, and what changing back to Supabase would need
- [`docs/CRM_BUILD_CONTRACT.md`](docs/CRM_BUILD_CONTRACT.md) — CRM module contract (data model, screens, gates)
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security architecture, hardening, and audit reports
- [`docs/DATABASE_CONTRACT.md`](docs/DATABASE_CONTRACT.md) — Supabase schema, RLS, and RPC expectations
- [`docs/DESIGN.md`](docs/DESIGN.md) — Visual direction and design tokens

## Commands

```bash
npm run lint                 # ESLint check
npm test                     # Vitest test suite
npm run build                # Production Next.js build
npm start                    # Start production server
```

Built by WebsiteIn.
