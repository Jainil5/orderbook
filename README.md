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

The sidebar is the map: **Products** holds the catalog, the Inventory tab and
offers; day-to-day operations sit under **Manager**, which is where Payments
lives now (`/manager/payments`; the old `/payments` URL redirects there).

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
segments, campaigns, loyalty_rules, loyalty_ledger, memberships) and the stock
tables (`inventory.csv` for both brands, `recipes.csv` for the cafe only — see
[Inventory and ingredient usage](#inventory-and-ingredient-usage)):

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
  an AI feature can later be measured against. The **AI Insights** tab below is
  the first of those features, and it holds the same line: it writes sentences
  over computed figures, never over invented ones.

### Product customizations (modifiers)

`products.modifiers_json` holds an array of **groups** — each one question the
cashier answers when the item is added to a bill:

```json
[
  { "id": "size", "name": "Size", "type": "single", "required": true,
    "options": [
      { "id": "sm", "name": "Small", "price": -30 },
      { "id": "md", "name": "Medium", "price": 0, "default": true },
      { "id": "lg", "name": "Large", "price": 40 }
    ] },
  { "id": "addons", "name": "Add-ons", "type": "multi",
    "options": [{ "id": "shot", "name": "Extra shot", "price": 40 }] }
]
```

- `single` renders as radios (coffee sizes, Fresh Lime Soda's
  Sweet/Salted/Mixed, fries' Salted-or-Peri-peri); `multi` renders as checkboxes
  (extra shot, cheese drizzle, "With ice cream +₹30").
- `price` is a **signed delta** on the item's list price, so a smaller size can
  cost less and a pure preference swap can cost nothing. A line never prices
  below zero.
- `default` preselects the choice. On a `required` single group it is also the
  fallback whenever a line carries no pick from that group, so older bills and
  API-created orders still price and print correctly.
- Option ids must be unique within a product: a cart line is
  `product + option ids`, so the same coffee at two sizes is two lines.
- A flat legacy list `[{ "id": "shot", "name": "Extra shot", "price": 40 }]` is
  still valid and reads as one optional "Add-ons" multi group — BR-2 ships it.

Resolution lives in `src/lib/products/modifiers.ts`; the POS chooser, the line
price, the saved order item and the product editor all read through it, so the
receipt label and the bill can't disagree. Caps: 8 groups, 12 options per group,
±100000 delta.

### Inventory and ingredient usage

**Products → Inventory** is the buying side of the business: material that
comes in as a pack and goes out inside a sale.

| What | Where it lives | Reads as |
|------|----------------|----------|
| Stock item | `data/demo/<brand>/inventory.csv` (`InventoryItem`) | Multigrain Bread — 18 slices a pack, ₹90 a pack, 6 packs on hand, reorder at 3 |
| Usage unit | `unit` + `units_per_pack` | the thing a person counts — slice, glass, shot, patty, ml, sq ft |
| Ingredient list | `data/demo/BR-1/recipes.csv` (`ProductIngredient`) | Flat White — 1 shot espresso, 150 ml milk, 1 cup, 1 lid, 1 decaf swap |
| Movement | the mutable store (`InventoryAdjustment`) | purchase in, wastage out, stock-count correction; `issue` is what a saved bill consumed |

- **Position** — what is on the shelf — is `stock_packs` plus every movement.
  Sales write movements themselves: saving a bill appends one negative `issue`
  row per stock item it drained, noted with the order number, so the count and
  the bills agree without anyone writing it down. A quotation drains nothing
  while it is a draft — accepting it is the commitment, and that is when the
  shelf moves, once however many times the accept button is pressed.
  Cancellations, refunds and credit notes consume nothing (`isConsumingOrder`),
  and cancelling a bill does not put the material back; a merchant who physically
  got it back records a stock count.
- **Usage** — what the menu ate — is *derived*, never stored: each sold line
  times its ingredient list. That is why a brand's seeded history reports usage
  on day one even though its pack ships no ledger rows. The window is a URL
  choice (`?tab=inventory&window=30`), so a shared link keeps its meaning.
- Fractional packs are the normal case: one Granola Bowl took 60 g from a
  1000 g bag (−0.06 packs), 150 g from a 2000 g yogurt tub (−0.07), 30 ml from
  a 1000 ml tetra of pulp (−0.03). The floor is zero — a finished item still
  prices correctly, the shelf just cannot go negative, and the tab says so.
- Ingredient lists are edited in the product dialog; stock items and movements
  in the Inventory tab. Both persist per browser in the same mutable demo
  cookie every other editor uses. Caps: 40 stock items, 120 movements,
  20 ingredient lines per product (`src/lib/demo/read-only.ts`).

The maths is one pure module — `src/lib/inventory/stock.ts`, no cookies and no
CSV reads — so the same functions price a sale, fill the tab and answer in
tests.

**The two verticals are stored differently on purpose.** BR-1 (Brewery Cafe)
ships `inventory.csv` — 33 items — *and* `recipes.csv`, 60 lines across 14 menu
products, because a kitchen has recipes; 31 of the 33 items are consumed by
something. BR-2 (Cubig Furniture) ships `inventory.csv` only — 22 items of
board, foam, fabric, hardware, finish and packaging, `flammable` storage on
lacquer, PU polish and thinner — and deliberately no recipes, because a
workshop's material leaves by the job rather than by the SKU. Its shelf moves
through recorded purchases, wastage and stock counts, and its
usage report stays empty until a merchant lists ingredients on a product. Same
tool, different seeded shape.

### Bill and quotation export

Once an order is saved, the document panel offers three copies of the same
paper — HTML in a browser tab, WhatsApp text, PDF — all built in the client from
the saved order, so none of them needs a server route to read per-browser demo
state.

**Open in browser** (`src/lib/documents/render-bill-html.ts`, handed over by
`open-bill-html.ts`) renders the bill or quotation as one standalone HTML file:
inline CSS, the issuer's logo and a quotation's product photos inlined as data
URLs, no `<script>` and no remote request. It is served to a new tab from a
`blob:` URL, so the merchant can print it, save it or forward it and it still
reads the same offline; `@media print` lays it out on A4. The tab is claimed
inside the click and then pointed at the finished file, because waiting for the
photos first would cost the click its user activation. If pop-ups are blocked the
file goes to downloads and the button says so. Names match the PDF:
`Bill-BC-1061.html`, `Quotation-CF-4491.html`.

### AI Insights

**AI Insights** (`/insights`) is a workspace tab in its own right, next to
Analytics. Four summary cards sit in a 2×2 grid at the top — *Last month
summary*, *Last 1 week summary*, *Reviews summary*, *Key points* — and nine
narrower briefs stay as buttons underneath: *Today's report*, *Most sold
items*, *Slow movers*, *Week vs week*, *Win-back list*, *Margin leaks*,
*Stock-out risk*, *Bundle ideas*, *Peak hours*. A free-text box routes a
question onto whichever brief it can actually answer ("what will we run out
of?" opens Stock-out risk), and every card states the window it will read before
anything is generated.

Each brief returns a headline, up to four computed metrics, the findings, and
what to do about it, and the whole thing copies out as plain text. The maths is
one pure module — `src/lib/ai/insights.ts`, no cookies and no CSV reads, like
`src/lib/inventory/stock.ts` — fed by the rows the page already has: Billing's
orders and line items, the CRM's customers and review inbox, and Inventory's
shelf positions. Windows are fixed inside each brief — the previous **calendar**
month for the monthly read, rolling 7 / 30 / 90-day slices everywhere else — so
the range picker on Analytics does not silently change what a report claims.

**Nothing here is model-generated yet.** Every number in a sentence is summed
from the dataset, so a brief agrees with the screen it came from, and an empty
window produces a written empty state rather than a plausible-sounding zero —
`src/lib/ai/insights-pack.test.ts` runs all thirteen briefs against both shipped
demo packs and fails on `NaN`, on a placeholder, or on "1 bills".

`src/lib/ai/request-insight.ts` is the **single seam** the Python service
replaces: today it awaits the local composer behind a short delay so the panel
already carries pending, success and failure states; swapping that body for a
`POST /api/ai/insights` forwarding `{ brand, kind, question, data }` needs no
change to the panel, the briefs' result shape, or their tests. Until it is
swapped, the tab labels itself "Drafted locally — no model wired yet".

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
