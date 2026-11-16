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
brand_settings) plus the CRM tables (interactions, reviews, complaints,
segments, campaigns, loyalty_rules, loyalty_ledger, memberships):

- `BR-1` — Brewery Cafe (15 products, 10 customers, 20 orders over ~6 months)
- `BR-2` — Cubig Furniture (8 products, 10 customers, 20 orders, quotations enabled)

Every table ships at least two rows, so no screen opens onto an empty list.

### Adds are switched off — except in the CRM

This build is a showcase of a fixed dataset, so nothing can be created: every
"Add / New" control is hidden and the matching server actions reject with the
message in [`src/lib/demo/read-only.ts`](src/lib/demo/read-only.ts). Editing
existing rows — statuses, notes, prices, stock flags, check-ins — still works,
and those edits persist **per browser** in cookies; the CSVs are never written
at runtime.

The CRM is the documented exception, because a CRM with nothing to log is not a
demo of a CRM. Creating an interaction, review, complaint, segment, campaign,
membership or ledger entry is allowed, and it lands in the same per-browser
mutable store an edit already uses — so the seeded CSVs still byte-for-byte
match the numbers the showcase stats assert. Two rules hold in every one of
those writes (`src/services/crm-actions.ts`): `brand_id` comes from the pack
and never from the form, and every foreign key is checked against the merged
rows the server reads, not against what the browser claims. Deleting a customer,
a product or an order is still refused — those belong to the fixed dataset.

The same file holds the caps the demo is sized to (per brand): 30 orders
(bills, quotations and credit notes together), 15 products, 10 customers,
30 payments. `src/lib/demo/brands/csv-pack.test.ts` asserts the shipped packs
stay inside them, and `src/lib/demo/order-store.ts` trims any cookie data that
would exceed the order cap.

## CRM

Seven modules under **Customers**, plus an overview — each its own route with
its own filters and actions, sharing one `Customer` row with Billing rather than
a copy of it (`src/lib/crm/*` holds the rules,
`src/services/crm-actions.ts` the writes):

| Module | Route | What it is |
|--------|-------|------------|
| Overview | `/customers` | Counts and sums only — every figure recomputed from the rows on file |
| Customers | `/customers/directory` | Search, filters, sort, paging, tags, custom fields, CSV import/export, duplicate detection |
| Leads | `/customers/leads` | The enquiry board, with conversion into a customer whose history stays readable |
| Interactions | `/customers/interactions` | Nine kinds of touchpoint, and follow-ups that become tasks on the Manager board |
| Reviews | `/customers/reviews` | Ratings, deterministic sentiment, unanswered inbox, escalation into complaints |
| Segments | `/customers/segments` | Saved rules that regroup customers from live data |
| Campaigns | `/customers/campaigns` | Audience, offer, dates and hand-logged results |
| Loyalty | `/customers/loyalty` | Points, tiers and memberships on the rules each brand chose |

`/customers/<id>` is the Customer 360: one stream projected from Billing, the
CRM log, the ledger and the pipeline, filterable by source. `/manager/leads` now
redirects to `/customers/leads`, so older links and the Manager overview card
still land somewhere.

Three things the CRM deliberately does **not** pretend to do:

- **It does not send messages.** No WhatsApp, SMS or email account is wired up.
  A campaign's counters are zero (`not_connected`) until a person types what they
  observed (`manual_log`), and the screen says which.
- **It does not fetch reviews.** The source field names where a review came
  from; nothing pulls from Google or Zomato.
- **It does not estimate.** No number on any CRM screen comes from a model.
  Review sentiment is a fixed lexicon score (`src/lib/crm/reviews.ts`), so the
  same text always gets the same answer — which is also what makes it something
  an AI feature can later be measured against.

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
- [`docs/SUPABASE_CRM_SCHEMA.sql`](docs/SUPABASE_CRM_SCHEMA.sql) — the CRM's
  intended Postgres schema (tenancy, keys, RLS). **Reference only:** nothing in
  `src/` reads or runs it; it is what the demo's CSV shape would become on a
  real database.

Built by WebsiteIn.
