# Supabase database contract (expected — owner provisions)

OrderBook integrates against this logical model. **Do not create or migrate tables from the app.**

## Core tables

| Table | Purpose |
|-------|---------|
| `brands` | Business profile; includes human-readable brand code (e.g. `BR-1`) |
| `brand_members` | Maps `auth.users.id` → `brand_id` + `role` |
| `brand_settings` | Currency, tax, receipt details, optional `quotation_builder_enabled`, optional `brand_website_url` (HTTPS) |
| `products` | … optional `default_discount_percent`, optional `image_url`, optional `stock_qty`, `low_stock_threshold`, `wholesale_price`, `modifiers_json` |
| `customers` | `brand_id`, contact fields, optional `price_tier` (`retail` \| `wholesale`) |
| `orders` | … optional `amount_paid`, `public_token`, `parent_order_id`, `order_kind` (`sale` \| `credit_note`) |
| `order_items` | … optional `modifier_labels` |
| `payments` | Optional payment records; optional `split_label`, `notes`, negative `amount` for refunds |
| `stock_adjustments` | Audit log: `product_id`, `delta_qty`, `reason` |

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
| `create_order(...)` | Transactional order + items + validation; accepts `p_customer_phone` for walk-in / POS mobile capture |
| `accept_quote_by_token(p_token)` | Public (anon) quote accept → confirmed order; see `docs/SUPABASE_EXTENSIONS.sql` |
| `analytics_orders_snapshot(p_from, p_to)` | Date-range KPIs for live Analytics |
| `analytics_*` or secured views | KPIs and charts without full table scans in the browser |

## Blockers when missing

- Login (beyond UI): auth email mapping + `brand_members`
- Live CRUD: tables + RLS
- Order submit: `create_order` RPC
- Analytics: secured aggregates

Replace demo fixtures by pointing data services at Supabase when schema is live.
