# CSV-backed demo data, Supabase removal, repo organization

Date: 2026-11-11
Status: approved (design approved in chat; user said "start implementing")
Branch: `feat/csv-demo-data`

## Goal

OrderBook is a sales demo: it exists to show prospective customers the product.
Remove Supabase entirely, make repo-stored CSV files the demo database, organize
demo images by SKU, and tidy the repo so it deploys cleanly (Vercel primary,
Railway via Dockerfile). The dataset — products, customers, the full 6-month
order history, payments, manager/operations data — stays exactly as it is today.

## Decisions (user-approved)

1. **Login** → demo picker, no passwords. Two brand cards, one click enters the workspace.
2. **Edit persistence** → CSVs are the read-only seed; in-demo edits keep saving to the
   browser cookie (`ob_demo_mutable_v1` + order store), exactly as today. No server-side writes.
3. **Deploy** → Vercel primary (zero config), Railway via Dockerfile. Netlify unverified
   (custom Next.js fork risk) — noted in README, not promised.
4. **Git** → premium UI merged to main (done, fast-forward to c646809); this work on
   `feat/csv-demo-data`; merge to main; push main to github.com/Jainil5/orderbook (push authorized).
5. **Data approach** → Approach A: full CSV dataset with frozen history + load-time date rebase.

## 1. CSV data layer

### Layout

`data/demo/BR-1/` and `data/demo/BR-2/`, 15 CSVs each:

| File | Rows today (approx) |
|------|--------------------|
| brand.csv | 1 (includes order_number_prefix column) |
| brand_settings.csv | 1 |
| products.csv | 24 (BR-1) / 8 (BR-2) |
| customers.csv | ~36 / ~36 |
| orders.csv | ~175 per brand (incl. generated history) |
| order_items.csv | ~440 per brand |
| payments.csv | ~160 per brand |
| offers.csv | few |
| staff.csv | few |
| services.csv | few |
| service_jobs.csv | few |
| appointments.csv | few |
| field_visits.csv | few |
| shifts.csv | few |
| tasks.csv | few |

Columns mirror `src/types/database.ts`, `src/types/manager.ts`, `src/types/operations.ts`
field names (snake_case as stored today). Null = empty cell. Booleans = `true`/`false`.
JSON columns (`modifiers_json`) and string-array columns (`staff_ids`) hold JSON text.

### Migration (one-time)

- Export script dumps the current `DemoBrandPack` objects — including the full
  `buildOrderHistory()` output — to the CSVs. Follows the existing `DUMP_SEED_SQL=1`
  test-dump pattern: `DUMP_DEMO_CSV=1 npx vitest run <export-test>`.
- Image URLs are rewritten during export to the new SKU paths (section 3).
- After export + verification: delete the TS fixture arrays, `history.ts` generator,
  `seed-sql.test.ts`, and the export test itself. CSVs become the only source.

### Loader (`src/lib/demo/csv/`)

- `parse-csv.ts`: zero-dependency RFC-4180 parser (quoted fields, escaped quotes,
  embedded commas/newlines, CRLF). Unit-tested.
- `mappers.ts`: per-entity row → typed entity (number/boolean/null coercion, JSON columns).
- `load-pack.ts`: raw CSV imports → mapped rows → date rebase →
  `DemoBrandPack` (identical shape to today, minus the dead analytics field).
  Module-level cache per brand.
- CSV contents are **bundled as raw imports** (turbopack rule or the fork's documented
  equivalent — check `node_modules/next/dist/docs/` during implementation; fallback is
  `fs.readFileSync` + `outputFileTracingIncludes`). No runtime disk reads on serverless.
- `src/lib/demo/brands/index.ts` keeps its public API (`getDemoBrandPack`,
  `resolveDemoBrandCode`); internals switch to the loader. All downstream consumers
  (`data.ts`, merge-entities, operations-data, staff-data, services) stay untouched.

### Date rebase

Pure function: `offsetDays = startOfToday(now) − maxDate(orders.created_at)`; shift every
timestamp column (orders.created_at/service_date, payments.created_at, offers
starts/ends, appointments, shifts, visits, tasks, staff.created_at) by the same offset.
Newest order lands today; today-pending bills stay today. Deterministic per day. Unit-tested.

### Analytics

Dashboard and Analytics pages already compute figures from order records via
`snapshotFromOrderRecords` — no change needed there. The hand-maintained static
`pack.analytics` object has no consumers (verified by grep): delete it, the
`DemoAnalytics` type, `snapshotFromDemo`, `getDemoAnalytics`, and `fixtures.ts`.

## 2. Supabase removal + demo-picker login

Deleted:
- `src/lib/supabase/` (client, server, service, middleware)
- `src/lib/env.ts`, `src/components/env-config-banner.tsx` (+ usages)
- Live-mode services: `src/services/data.ts`, `src/services/order-operations.ts`,
  `src/services/quotes.ts` (demo equivalents already exist: `demo/server.ts`,
  `demo/public-quote.ts`); live branches in `operations-actions.ts`,
  `manager-ops-actions.ts`, `quote-actions.ts`, `product-actions.ts`, `actions.ts`
- Supabase auth in `src/lib/auth/actions.ts` (`loginWithBrandCode`, `loadLiveWorkspace`,
  `loadActiveMembership`); `logoutAction` becomes cookie-clear + redirect
- `scripts/check-env.mjs`, `scripts/setup-local-env.mjs`, `predev`/`setup:env`/`check:env`
  scripts, `.env.example`; `@supabase/ssr` + `@supabase/supabase-js` deps
- `docs/SUPABASE_EXTENSIONS.sql`, `docs/SUPABASE_RLS_APPLY.sql`,
  `docs/SUPABASE_RLS_RECOMMENDED.sql`, `docs/SUPABASE_SEED_HISTORY.sql`,
  `docs/DATABASE_CONTRACT.md`, `src/lib/demo/brands/seed-sql.test.ts`
- `isTrustedSupabaseUrl` and other Supabase-only security helpers (keep the rest)

Kept/changed:
- Middleware: probe-path 404s, `/demo?brand=` redirect + demo cookie, security headers;
  workspace/print routes require demo cookie else redirect `/login`. No session refresh.
- `WorkspaceSession`: single demo variant (drop `mode: "live"`, `member`, `userEmail`);
  collapse `ws.mode === "demo"` branches at call sites.
- Login page: brand picker (Brewery Cafe / Cubig Furniture cards) calling the existing
  `enterDemoWorkspace` server action. Landing CTAs unchanged.
- App requires **zero environment variables**. `.env.local` becomes unnecessary.

## 3. Images by SKU

- `public/demo/products/BR-1/<SKU>.jpg`, `public/demo/products/BR-2/<SKU>.jpg`
  (e.g. `BV-CF-001.jpg`, `CB-DN-001.jpg`). All 28 existing local JPGs renamed/moved.
- Download the 4 Unsplash hotlinks (granola, wardrobe, bedside, stool) into the repo under
  their SKUs. If a download fails, substitute same-style stock (user-approved fallback).
- `products.csv.image_url` and `order_items.product_image_url_snapshot` use the new paths.
- Delete `src/lib/demo/product-image-urls.ts` and all references.
- Brand logo `public/brands/cubig-furniture-logo.png` stays.

## 4. Repo organization + deployment

- Remove: empty `vibe_images/`, unused default Next SVGs in `public/` (verify no
  references first), Supabase docs (above), env scripts (above).
- `README.md` rewrite: product summary, demo brands, run (`npm i && npm run dev`, no env),
  editing/adding CSV rows, image naming convention, Vercel + Railway deploy steps,
  Netlify caveat.
- `Dockerfile`: multi-stage node-alpine (deps → build → runner), `next start`, honors
  `PORT`, keeps `NODE_OPTIONS=--max-http-header-size=65536`. `.dockerignore`:
  node_modules, .next, .git, .worktrees, docs.
- Vercel: zero config; verified by clean `next build` with no env vars.
- `.gitignore`: ensure `data/` and `public/demo/` are committed; keep `.env*` ignored.
- Security docs (`docs/SECURITY*.md`): remove Supabase-specific guidance; keep general
  headers/input/rate-limit notes accurate for the demo-only app.

## 5. Error handling

- CSV parse/mapping errors fail fast at load with file + row + column context. Data is
  repo-owned and test-validated; no silent fallbacks.
- Missing image → existing placeholder tile behavior (unchanged).
- No env-related error states remain.

## 6. Testing + verification

New unit tests: parser (quotes/commas/newlines/CRLF), mappers (null/bool/number/JSON),
date rebase (today-bills stay today, ordering preserved), pack integrity (referential
integrity orders↔items↔payments, unique SKUs, every image_url file exists).

Existing suite (~200 tests): history/seed-SQL tests deleted with their code; fixture
tests repointed at CSV packs; all others stay green.

Gates: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `next build` (no env).
Browser E2E (isolated browser, 375px + desktop, both themes): picker → both brands →
billing → create order → refresh persists → analytics figures → SKU images render →
notifications feed.

## Out of scope

- Real authentication / multi-tenant live mode (product is demo-only for now).
- Netlify adapter support.
- Writing demo edits back to CSV files.
- New demo data beyond what exists today (user: "data, history and all remains same").