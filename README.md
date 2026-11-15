# OrderBook

POS, billing, and analytics workspace by **WebsiteIn** — shipped as a fully
self-contained product demo. Two sample businesses (a café and a furniture
studio) run on repo-stored CSV data. No database, no accounts, no environment
variables.

## Stack

- Next.js App Router (custom 16.x fork), React 19, TypeScript (strict)
- Tailwind CSS v4 + shared `--ob-*` design tokens (Dark Botanical), dual
  light/dark theme
- Recharts + Motion for charts and UI motion
- Vitest for unit tests

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, pick a demo business on the login screen, and
explore. That's the whole setup — there is nothing to configure.

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest suite |

## Demo data

The dataset lives in **`data/demo/<brand>/*.csv`** — one file per table
(products, customers, orders, order_items, payments, offers, staff, services,
service_jobs, appointments, field_visits, shifts, tasks, leads, brand,
brand_settings):

- `BR-1` — Brewery Cafe (15 products, 10 customers, 20 orders over ~6 months)
- `BR-2` — Cubig Furniture (8 products, 10 customers, 20 orders, quotations enabled)

Every table ships at least two rows, so no screen opens onto an empty list.

### Adds are switched off

This build is a showcase of a fixed dataset, so nothing can be created: every
"Add / New" control is hidden and the matching server actions reject with the
message in [`src/lib/demo/read-only.ts`](src/lib/demo/read-only.ts). Editing
existing rows — statuses, notes, prices, stock flags, check-ins — still works,
and those edits persist **per browser** in cookies; the CSVs are never written
at runtime.

The same file holds the caps the demo is sized to (per brand): 30 orders
(bills, quotations and credit notes together), 15 products, 10 customers,
30 payments. `src/lib/demo/brands/csv-pack.test.ts` asserts the shipped packs
stay inside them, and `src/lib/demo/order-store.ts` trims any cookie data that
would exceed the order cap.

### Full sample data (recovery copy)

**`data/demo-archive-full/`** keeps the pre-lock-down dataset — 274 BR-1 orders
across 43 customers, 77 BR-2 orders across 29 customers — in the same column
layout. It is not read by the app; it exists so the bulk sample can be restored
if the compact packs are ever damaged. See
[`data/demo-archive-full/README.md`](data/demo-archive-full/README.md).

Edit rows in any spreadsheet app and restart the dev server. Columns mirror the
TypeScript entity types in `src/types/`. Empty cell = null, `true`/`false` for
booleans, JSON text for `modifiers_json` and `staff_ids`.

Historical dates are **rebased at load** so the newest order always lands
today — the demo stays fresh without touching the files.

Product photos live in **`public/demo/products/<brand>/<SKU>.jpg`**, named by
product SKU. The `image_url` column in `products.csv` points at them.

## Deploy

**Vercel (recommended):** import the repo, deploy. Zero config, zero env vars.

**Railway:** the included `Dockerfile` builds and serves the app (`next start`,
honors `PORT`). Create a service from the repo and deploy.

**Netlify:** not verified — this repo uses a custom Next.js fork and the
Netlify Next.js runtime may lag behind it.

## Documentation

- [`docs/SECURITY.md`](docs/SECURITY.md) — security guardrails for the demo app
- [`docs/DESIGN.md`](docs/DESIGN.md) — visual direction and design tokens

Built by WebsiteIn.
