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
offers; **CRM** (route `/customers`) holds the customer-facing modules; and
day-to-day operations sit under **Manager**, which is five screens —
Staff & Schedules, Meetings & Visits, Tasks & Activities, Purchasing & Vendors
and Payments (`/manager/payments`; the old `/payments` URL redirects there).

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
segments, campaigns, loyalty_rules, loyalty_ledger, memberships), the stock
tables (`inventory.csv` for both brands, `recipes.csv` for the cafe only — see
[Inventory and ingredient usage](#inventory-and-ingredient-usage)) and the
purchasing tables (`vendors.csv`, `purchase_orders.csv`,
`purchase_order_lines.csv`, both brands — see
[Purchasing, vendors and receiving](#purchasing-vendors-and-receiving)):

- `BR-1` — Brewery Cafe (15 products, 10 customers, 20 orders over ~6 months)
- `BR-2` — Cubig Furniture (8 products, 10 customers, 20 orders, quotations enabled)

Every table ships at least two rows, so no screen opens onto an empty list.

### Adds are capped, not switched off

Creating works in every screen that needs it — bills, quotations, stock items,
CRM records, manager tasks, vendors and purchase orders. None of it touches the
CSVs: a new row lands in the same per-browser mutable cookie store an edit
already uses (`src/lib/demo/mutable-store.ts`), so the seeded packs stay
byte-for-byte what the showcase stats assert. What a visitor adds stays in that
browser until its cookies are cleared — logging out of the demo keeps it, on
purpose, so a bill rung up during a walkthrough is still there on the next
screen. `src/lib/demo/read-only.ts` holds the caps the demo is sized to (per
brand): 30 orders (bills, quotations and credit notes together), 15 products,
10 customers, 30 payments, 40 stock items and 120 stock movements, 20 vendors
and 30 purchase orders. When a capped collection is full the write is refused
with a message that says how to reset it; for the document-style collections
the oldest browser-created row is recycled instead, so seeded history is never
dropped. `src/lib/demo/brands/csv-pack.test.ts` asserts the shipped packs stay
inside the caps.

Two rules hold in every one of those writes: `brand_id` comes from the pack and
never from the form, and every foreign key is checked against the merged rows
the server reads, not against what the browser claims. And there is still no
delete path for a customer, a product or a saved bill — those belong to the
fixed dataset. Deleting a vendor that an open order still depends on is refused
too, by name of the order.

## Brand websites

Each demo brand has a public storefront at **`/site/BR-1`** (Brewery Cafe) and
**`/site/BR-2`** (Cubig Furniture) — reachable without signing in, themed per
brand (`site-br1` espresso-and-caramel, `site-br2` graphite-and-brass), and laid
out as one editorial page with an anchor nav in the idiom of the reference sites
they borrow from (Ember Larder's section flow, Cubig's category tiles and
best-seller rails): statement hero → the card → the room / the workshop → the
set → voices → notes → visit → footer. Motion is motion.dev plus
aceternity-style effects written in-repo: cursor-tracked spotlight cards
(`.site-spot`), sweeping hero beams, Ken-Burns shelf photos, counters that sit
at zero and roll up when they scroll into view, a looping review belt and
spring-animated tabs.

Two rows of numbers sit one under the other in the hero, and they say so: the
counter row is house copy from `src/lib/site/registry.ts` ("12 hrs the cold
brew steeps", "18 mm solid tops"), and the strip beneath it is counted from the
pack's own ledger (tickets, customers on file, lines on the card, average
rating). Everything else the page shows comes from `src/lib/site/menu.ts`: the
brand's products grouped by their CSV categories, each product's default
discount folded into the site price, the same Size/Add-on modifier groups the
counter POS asks for, *Popular* on rows `order_items.csv` sold twice or more, a
sold-out shelf exactly like Billing's, and a detail line per card — "120
portions on the shelf · pulled when you order" — built from that row's own
stock figure. The rail above the grid is the same history sorted by repeat
volume, and the shelf header counts itself out of the rows.

The set block is priced the same way. `resolveSet` looks each course up on the
live card, sums the counter's own prices, and drops — and says it dropped — any
line that is no longer sold. "Add the whole tray" puts exactly those rows, with
their default modifiers, into the same cart the individual cards use.

On the **Order** tab the cart (localStorage per brand) prices lines exactly
like `build-order-record.ts` does — effective price plus modifier deltas — and
applying an offer code runs `validateOfferCodeForCart` against the same pack
offers. **Place order** is one plain `POST /api/site/BR-1/order`
(`src/app/api/site/[brand]/order/route.ts`) — deliberately a JSON route handler
rather than a server action: this is the one surface strangers use, and an
action's `text/x-component` reply breaks behind CDNs, carrier proxies and the
preview gateway, leaving the customer a crash screen on an order that actually
went through. The route validates the body at its own boundary
(`src/lib/site/order-request.ts` — limits, clamps, one readable message per
rejection; a list too long to keep whole is refused, never silently shortened)
and then calls `placeWebOrder` (`src/lib/demo/server.ts`), which
takes the brand code explicitly, validates and re-prices everything
server-side through the same `buildOrderRecord` the counter uses, matches the
phone against the CRM (creating a customer row when it is new), records the
sale's ingredient consumption, and writes an `order_type: "online"` ticket into
that brand's demo bucket with the customer's name, modifiers and note on it.

The workspace hears about it in two places: the **Orders** board shows the
ticket with an *Online order* badge, and the **notification bell** is seeded
from the same rows — "New online order BC-1061 · Kabir Rao · 3 items · ₹440 ·
Brewery Cafe website" (`src/lib/notifications/web-orders.ts`), linking straight
to the order. This replaced the old simulated incoming-orders tick, so
everything in the bell is a real row. The workspace header's *Brand website*
button now opens these sites, because `brand_settings.csv` points at the
in-app route; printed documents keep their absolute URLs (only `http*` values
override the document profile). As with all demo writes, orders land in the
same browser's workspace — a visitor ordering from their own device writes to
their own bucket, and nothing is charged anywhere.

The same two signature effects now run inside the workspace too. `Odometer`
takes an opt-in `whenInView` — the number holds at zero and rolls up the first
time it scrolls into view, the way the reference sites' counters do — on the
Dashboard's four KPI tiles and the Analytics cards, and
`src/components/effects/reveal.tsx` fades-and-rises a block once as you reach it
(the Dashboard's chart grid). Both keep the final string in the server HTML for
no-JS and reduced-motion readers, and every other `StatCard`/`Odometer` call
site renders exactly as before.


## CRM

Seven modules under the **CRM** tab (route `/customers`), plus an overview —
each its own route with its own filters and actions, sharing one `Customer` row
with Billing rather than a copy of it (`src/lib/crm/*` holds the rules,
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
CRM log, the ledger and the pipeline, filterable by source. The pipeline is a
CRM screen and nothing else — the Manager overview still counts open leads and
links here, and `/manager/leads` redirects to `/customers/leads` for older
links.

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

### Purchasing, vendors and receiving

**Manager → Purchasing & Vendors** (`/manager/purchasing`) is the other half of
the buying side: the Inventory tab says what the shelf is short of, this screen
turns that into an order on a named vendor and books what actually arrives back
onto the shelf.

| What | Where it lives | Reads as |
|------|----------------|----------|
| Vendor | `data/demo/<brand>/vendors.csv` (`Vendor`) | PackRight Supplies — 4-day lead, UPI, rating 3.6, 1 open order |
| Purchase order | `purchase_orders.csv` (`PurchaseOrder`) | PO-1042 to PackRight — sent, ₹3,420 over three lines, and past the date it promised |
| Order line | `purchase_order_lines.csv` (`PurchaseOrderLine`) | 10 packs of Paper Napkins at ₹90, 4 of them in |
| Status machine | `draft → sent → partially_received → received`, or `cancelled` | derived on every receipt, never typed in |

- **A receipt books only what arrived.** Over-receipt is refused with the
  number of packs left on the line, and each accepted pack appends a `purchase`
  movement to the same `inventoryLedger` the Inventory tab already reads —
  costed at the line's ₹ per pack, noted `PO-1042 · Paper Napkins`. There is no
  second book of stock, so the shelf and the order cannot disagree.
- **Only a promised order counts as incoming.** `incomingPacksByItem` ignores
  drafts and cancellations, which is what makes the reorder suggestion honest:
  it targets the reorder level plus two packs of cover, minus what is on the
  shelf and minus what is already on its way, and *Fill short items* turns that
  list into a draft order in one press.
- **The delivery promise is the vendor's, not a guess.** Sending a draft with no
  expected date sets `sent_at + lead_time_days`; that date is what moves the
  *Past their date* card.
- **Cancelling never unwinds a booked movement.** What physically arrived stays
  on the shelf; what did not simply stops being counted. Deleting an order is
  only allowed while it is a draft or already cancelled, and it tombstones its
  lines. A vendor with an open order cannot be deleted — the refusal names the
  order.
- Item name and unit are **snapshotted onto the line** at create time, so a
  receipt years later still reads what was ordered even if the catalog changed.
- The maths is one pure module (`src/lib/procurement/purchasing.ts` — totals,
  outstanding, lateness, suggestions, validation), the writes are one server
  action file (`src/services/procurement-actions.ts`), and both brands ship
  seeds: BR-1 five vendors and six orders across dairy, produce, packaging and
  coffee; BR-2 the workshop equivalent — board, foam and fabric, hardware,
  finish, packaging. Caps: 20 vendors, 30 orders, 120 lines, and
  `csv-pack.test.ts` keeps every line pointing at a real vendor and item with
  `received_packs ≤ packs`.

### Bill and quotation export

Once an order is saved, the document panel offers three copies of the same
paper — HTML in a browser tab, WhatsApp text, PDF — all built in the client from
the saved order, so none of them needs a server route to read per-browser demo
state.

**The Billing panel is the bill.** The right-hand column of `/billing` (and
`/quotation`) is not a card of form fields but a document sheet —
`.ob-bill` in `globals.css` — with the same hierarchy as the printed copy:
letterhead with the brand's own mark, a one-line bill-to (mobile + name), the
order-type and payment controls, a recap of everything else as chips with an
**Edit details** disclosure underneath, then ruled lines each carrying a small
product photo, the CGST/SGST split, and the receipt footer. A validation failure
inside the disclosure opens it, so a collapsed panel can never hide the field
that needs fixing. When an order is saved the sheet switches to that issued
document (`src/components/billing/bill-document-preview.tsx`) instead of an empty
draft, with the export buttons and "Start the next bill" below it.

The letterhead comes from `src/lib/documents/brand-profile.ts`, which now holds a
profile per demo brand — Brewery Cafe (roast-brown accent, Indiranagar address,
`/brands/brewery-cafe-logo.png`) and Cubig Furniture — so a cafe bill prints with
the cafe's mark and terms rather than falling back to a bare brand name. Adding a
third brand is one entry in that map. Photos print on **bills as well as
quotations**: `build-bill-document.ts` snapshots `image_url` onto every line and
the HTML and PDF renderers decide on the photo column by whether they were handed
real images, not by document kind.

**Open in browser** (`src/lib/documents/render-bill-html.ts`, handed over by
`open-bill-html.ts`) renders the bill or quotation as one standalone HTML file:
inline CSS, the issuer's logo and the line photos inlined as data
URLs, no `<script>` and no remote request. It is served to a new tab from a
`blob:` URL, so the merchant can print it, save it or forward it and it still
reads the same offline; `@media print` lays it out on A4. The tab is claimed
inside the click and then pointed at the finished file, because waiting for the
photos first would cost the click its user activation. If pop-ups are blocked the
file goes to downloads and the button says so. Names match the PDF:
`Bill-BC-1061.html`, `Quotation-CF-4491.html`.

### AI Insights

**AI Insights** (`/insights`) is a workspace tab in its own right, next to
Analytics. Four summary cards sit in a 2×2 grid at the top — *Today*, *Last
week*, *Last month*, *Suggestions* — and they are **already written when the
page opens**: the server composes each one before it renders, so the headline,
the metrics and the window are on screen with no click and no spinner, and
"Read full brief" expands instantly. Ten narrower briefs stay as buttons
underneath — *Reviews summary*, *Key points*, *Most sold items*, *Slow movers*,
*Week vs week*, *Win-back list*, *Margin leaks*, *Stock-out risk*, *Bundle
ideas*, *Peak hours* — and those still go through the drafting path. A
free-text box routes a question onto whichever brief it can actually answer
("what will we run out of?" opens Stock-out risk), and every card states the
window it will read before anything is generated.

*Suggestions* is a composition rather than a fifth calculation: it quotes the
first action of seven other briefs, in a fixed order (shelf, counter,
reputation, margin, people, catalog, bundling), so a suggestion can never
contradict the screen it came from.

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
`src/lib/ai/insights-pack.test.ts` runs all fourteen briefs against both shipped
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
