# OrderBook

POS, billing, and analytics workspace by **WebsiteIn** — shipped as a fully
self-contained product demo. Two sample businesses (a café and a furniture
studio) run on repo-stored CSV data. No database, no accounts, no environment
variables.

## Stack

- Next.js App Router (custom 16.x fork), React 19, TypeScript (strict)
- Tailwind CSS v4 + shared `--ob-*` design tokens, dual light/dark theme
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
service_jobs, appointments, field_visits, shifts, tasks, brand, brand_settings):

- `BR-1` — Brewery Cafe (24 products, ~270 orders incl. 6 months of history)
- `BR-2` — Cubig Furniture (8 products, quotations enabled)

Edit or add rows in any spreadsheet app and restart the dev server. Columns
mirror the TypeScript entity types in `src/types/`. Empty cell = null,
`true`/`false` for booleans, JSON text for `modifiers_json` and `staff_ids`.

Historical dates are **rebased at load** so the newest order always lands
today — the demo stays fresh without touching the files.

Product photos live in **`public/demo/products/<brand>/<SKU>.jpg`**, named by
product SKU. The `image_url` column in `products.csv` points at them.

Edits made inside the demo (new orders, product changes, settings) persist
**per browser** via cookies — each visitor gets their own sandbox, and the
CSVs are never written at runtime.

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
