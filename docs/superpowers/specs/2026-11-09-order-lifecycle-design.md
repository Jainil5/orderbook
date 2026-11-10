# Order Lifecycle & Billing Capture — Design Spec

**Date:** 2026-11-09 · **Branch:** `feat/order-lifecycle` (off merged `main` 3327a5b)
**Status:** design approved by Jainil in chat ("Start as is"); this doc is the binding spec.
**Program note:** sits between Plan A (Phase 2 ops, merged) and Plan B (Phase 3 metrics kernel). The 6-month history below becomes Plan B's test corpus; Plan B's metrics definitions must adopt §6's rules.

## Problem

Today a bill saves as an already-completed, already-paid order, so the business cannot see ongoing orders. Customer identity is a saved-customer picker; there is no order type, no date control, no availability signal on items, and demo history is ~10 days deep — too thin to show trends.

## Goals

1. Orders have a real lifecycle: **Pending → Completed** (with payment finalization rules), Cancel preserved.
2. Bill capture is a proper POS form: phone-primary customer, order type, date, conditional delivery/table fields, offer-code selector with manual entry, payment-method choice, notes.
3. Orders page becomes a live board (ongoing queue + completed today) with an All-orders tab.
4. Products can be marked **Unavailable** (A/NA) visible and togglable in Billing and Products.
5. Demo history: deterministic **6 months** with growth-and-dip shape, in fixtures (zero cookie cost) + paste-ready Supabase seed SQL.

## Non-goals

- No Supabase live-mode wiring or schema fixes (seed SQL is paste-ready only; live stays non-functional until Plan B/C).
- No new analytics dashboard (Plan C) — but §6 locks the counting rules dashboards must use.
- No split payments UI beyond the existing record-payment panel; no printing/receipts.
- Quotation document mode stays as-is; only the bill's "Save as quotation" checkbox is removed.

## 1. Data model

`src/types/database.ts`:

- `OrderStatus` gains `"pending"`. Full union: `draft | pending | confirmed | completed | cancelled | refunded` (`draft` remains quotation-only).
- `Order` gains optional fields (all nullable, all backward-compatible — existing stored orders simply lack them):
  - `order_type?: "dine_in" | "takeaway" | "delivery" | "online"`
  - `service_date?: string` — local calendar day `YYYY-MM-DD`; set at save from the bill date control (defaults today local).
  - `guests?: number | null`
  - `delivery_address?: string | null`
  - `payment_method?: string | null` — method chosen at billing (`"UPI" | "Card" | "Cash" | other`); `null` = "Payment pending".
  - `payment_reference?: string | null` — txn/order ref text.
- `Product` gains `unavailable?: boolean` — distinct from `active` (inactive hides from catalog; unavailable greys the tile and blocks cart adds). Persisted via the existing demo override path (same as `active` toggles).

Demo merge layers (`merge-entities`, mutable store) carry the new fields through the existing override/tombstone machinery — no new bucket shape for orders beyond data the fields already allow.

## 2. Lifecycle rules

| Action | From | To | Payment effect |
|---|---|---|---|
| Confirm & save (bill) | — | `pending` | `payment_status: "pending"`, no Payment row, `amount_paid` 0 |
| **Order Completed** (board/detail) | `pending` or `confirmed` | `completed` | if `order.payment_method` set: create Payment row (amount = grand_total, that method), `payment_status: "paid"`; if null: stays `"pending"` |
| Record payment (existing panel) | `pending`/`completed` | — | unpaid → partial → paid as today |
| Cancel | `pending`/`confirmed` | `cancelled` | excluded from all revenue; existing behavior |

The existing operations-panel status buttons (Confirm/Complete/Cancel) remain for `draft`/`confirmed` legacy and quotation-accept flows; POS orders only ever move `pending → completed` or `→ cancelled`.

Completion guards reuse the existence-check pattern (`hasOpsRecord` style): completing an unknown or already-completed id returns `{ok:false,message}` — no silent success.

**Cart hygiene (Plan A hand-off folded in):** successful save clears the bill cart, offer code, and date back to defaults.

## 3. Bill capture form

- **Mobile** — required, primary identity; validated with existing `normalizeCustomerPhone`; save blocked with inline error when empty/invalid.
- **Name** — optional; defaults to `"User"` on save.
- **Auto-link/seed:** on save, mobile is matched against existing customers (normalized compare). Match → order links to that customer. No match → customer auto-created (name entered or `"User"`). The saved-customer dropdown and the "save walk-in as new customer" checkbox are removed.
- **Date** — `YYYY-MM-DD` input, default today (local); editable for backdating and future orders. Drives `service_date`; analytics bucket on it (§6).
- **Type** — segmented control: Dine-in / Take-away / Delivery / Online (required, default Dine-in).
  - Dine-in → Table tag (optional) + Guests (optional number).
  - Delivery → Delivery address (optional text) + notes; `table_tag` stays a dine-in-only field.
  - Take-away / Online → no extra fields beyond reference below.
- **Offer code** — `<select>` listing active offer codes (from merged offers, fixture + demo overrides) with `— None —` default plus **"Enter your own code…"** which reveals a free-text input. Unknown/invalid code → save blocked with the existing discount-error message. Math unchanged (caps, min-order, scope).
- **Payment** — choice: Payment pending (default) / UPI / Card / Cash. Optional **Reference** text (txn id / platform order no).
- **Notes** — optional textarea (special instructions: "no ice").
- **Availability:** product tiles show badge **A** (green) / **NA** (red); NA tiles are not tappable and a tap shows a hint. Toggling availability from Products page is reflected immediately in Billing (same override store, `router.refresh()`).
- Removing the quotation checkbox: `documentMode` quotation path stays for the standalone quotation feature only.

## 4. Orders page = board + All tab

- Default tab **Ongoing**: section 1 = pending orders sorted oldest-first by save time with live wait label ("12 min" — local-time rendered, mounted-gated); section 2 = orders completed today, newest-first. Row shows order no, type badge, customer name/phone, table/address label, total, payment badge, and an **Order Completed** button (44px target) + Cancel.
- Tab **All orders**: existing `OrdersTable` (status filters unchanged).
- Order detail: shows the new fields (type, date, method, guests/address, reference); keeps record-payment panel; gains the Complete button when eligible.
- CSV export gains order_type / service_date / payment_method columns when present.

## 5. Availability UX

- Products page: each card gets an Available/Unavailable toggle (demo override action alongside the existing active toggle; live path shows honest unavailable state like other live actions).
- Billing tiles: A = `var(--ob-success)` tint chip, NA = `var(--ob-danger)` chip; NA excluded from "add by search/enter" paths too.
- Checkout edge: an item already in cart when marked NA stays in cart (staff decision) — no retroactive removal.

## 6. Demo history — 6 months, growth + dip

Deterministic dataset committed as brand-pack fixture files (generated once by a script, then static — reproducible, zero cookie cost):

- **BR-1 (Brewery Cafe):** ~40 orders/month × 6 months (~240), spanning complete months 2026-05 → 2026-10 plus the current partial November. Month totals shape: steady growth ≈ +12–15%/mo May–Oct, **November down ≈ −20% on daily-rate basis vs October**, and a visible **rebound in the last 5–7 days** back to the October rate. Weekday rhythm (weekends heavier), category-mix realistic, ~40 customers each with 1–8 orders across months, ~5% cancelled, ~8% with offer-code discounts (existing FOOD50/HAPPY10 rules respected incl. caps), payment mix UPI/Cash/Card; a handful completed-but-payment-pending to exercise the record-payment flow.
- **BR-2 (Cubig Furniture):** same shape, ~15 orders/month.
- Past orders use `status: "completed"`, `payment_status: "paid"` (except the deliberate pending set), `service_date`/`created_at` consistent with their day, and satisfy `subtotal − discount + tax = grand_total` exactly (validator-tested).
- **Counting rules (binding for dashboards and Plan B):** NET SALES / collected / avg = `completed` only, by `service_date`; `pending` and `confirmed` excluded from revenue, surfaced as "in progress" counts on Overview; `cancelled` excluded entirely. Existing dashboard code updated to this rule (today it sums all saved demo orders, which under the new lifecycle would count unpaid pending food as revenue).
- Fixture volume keeps the *cookie* budget untouched (server-side files); the 40-order cookie cap still applies to in-session orders only.

## 7. Supabase seed SQL

`docs/SUPABASE_SEED_HISTORY.sql` — paste-ready INSERT statements mirroring §6's dataset into the real `customers`, `orders`, `order_items`, `payments` tables per the current schema in `src/types/database.ts`. Single deterministic file, no app wiring, no RPC changes. (Schema drift is Plan B's audit scope; the seed only needs to be valid SQL for tables that exist today, skipping any column that drift removed.)

## 8. Error handling

- Save: invalid phone → inline `role="alert"`; unknown offer code → save blocked; date not parseable → save blocked.
- Actions (complete/cancel/toggle-availability): non-allowed role → "Not allowed."; unknown/gone id → "Order not found." / "Product not found."; success clears stale errors (existing contract).
- Hydration: every now-based label (wait time, "completed today", day defaults) uses `useMounted()` + local-time helpers from `src/lib/manager/time.ts`.

## 9. Verification

- **Unit (TDD):** transition table incl. payment auto-record and method-null case; completion existence guards; phone auto-link/auto-create; offer-code custom-entry validation; fixture invariants (totals math, month-shape tolerances, no future dates, service_date↔created_at consistency); dashboard rule (pending excluded).
- **Static:** `npm test && npx next typegen && npx tsc --noEmit` green.
- **E2E (isolated Playwright, dev :3003):** bill → Pending on board with wait label → Complete → payment recorded + disappears into "completed today" → dashboard nets unchanged by pending, updated by completed; custom-code offer; delivery order with address; NA tile blocks cart and Products toggle reflects in Billing; backdate + future date save; record-payment on a completed-with-pending-payment order; reload persistence; mobile 375px board usability (≥44px targets, no h-overflow); legacy demo orders (saved pre-change) still render.
- **Data check:** seeded BR-1 analytics window (last 30 days) shows the dip-vs-rebound trend visibly on the dashboard.

## Global constraints (unchanged from the program)

Demo-first (cookie stores, both brands); demos never touch Supabase; honest live-mode empty states; action contract `{ok:true}|{ok:false,message}`; ≥44px touch targets (`ob-touch-target`); Playwright MCP isolated browser only, never the user's Chrome, never :3000; `npx next typegen` before `npx tsc --noEmit`; no scratch files in repo; stop agent servers after testing; trailing newlines; `next dev`'s AGENTS.md block committed with the work.
