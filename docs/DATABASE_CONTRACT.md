# Supabase database contract (expected — owner provisions)

OrderBook integrates against this logical model. **Do not create or migrate tables from the app.**

## Core tables

| Table | Purpose |
|-------|---------|
| `brands` | Business profile; includes human-readable brand code (e.g. `BR-1`) |
| `brand_members` | Maps `auth.users.id` → `brand_id` + `role` |
| `brand_settings` | Currency, tax, receipt details |
| `products` | `brand_id`, name, description, sku, category (text or FK), price, cost, unit, active |
| `customers` | `brand_id`, contact fields |
| `orders` | `brand_id`, order/bill number, status, payment status, totals, customer snapshot, notes |
| `order_items` | Line items with historical unit prices and discount snapshots |
| `offers` | Discount rules, codes, scopes, limits |
| `payments` | Optional payment records |

Optional: `offer_products`, `offer_categories`, `offer_redemptions`, `refunds`.

## Security

- Every brand-owned row includes `brand_id`.
- RLS restricts reads/writes to members of that brand.
- **Never** authorize using client-supplied `brand_id`.
- Active brand is derived from `brand_members` after Supabase Auth.

## Auth mapping (login)

Login UI collects **brand code + password**. Required server contract (choose one):

1. **RPC** `resolve_brand_auth_email(p_brand_code text) returns text` — returns auth email for sign-in only to authenticated server role, or
2. **Server env** `BRAND_AUTH_EMAIL_MAP` JSON until RPC exists (Railway secret, not `NEXT_PUBLIC_`).

Then: `signInWithPassword` → load `brand_members` → session.

## Demo dataset

Preferred: dedicated demo `brand_id` with RLS-safe read-only policies or `security_invoker` views.

Until configured: app uses `src/lib/demo/fixtures.ts` (local read-only adapter).

## RPCs / views (recommended)

| Name | Purpose |
|------|---------|
| `create_order(...)` | Transactional order + items + validation |
| `analytics_*` or secured views | KPIs and charts without full table scans in the browser |

## Blockers when missing

- Login (beyond UI): auth email mapping + `brand_members`
- Live CRUD: tables + RLS
- Order submit: `create_order` RPC
- Analytics: secured aggregates

Replace demo fixtures by pointing data services at Supabase when schema is live.
