-- OrderBook — RLS enforcement script (executable; P0 leak fix)
--
-- WHY THIS EXISTS: as of 2026-11-06 the Supabase project
-- (https://vdrnkhtltpwrkfjnlasf.supabase.co) was readable with the *anon*
-- publishable key. That key is public by design (it ships in the browser
-- bundle), so every tenant table was effectively world-readable:
--
--   brands, brand_settings, products, customers, orders, order_items,
--   offers, payments  ->  HTTP 200 as anon, real rows returned.
--   customers leaked customer_name, mobile_number, email, notes.
--   payments leaked 5 rows, orders leaked 6, order_items 12.
--
--   The prior docs/SUPABASE_RLS_RECOMMENDED.sql is entirely commented out,
--   so pasting it changes nothing. This file is not commented out.
--
-- HOW TO RUN: Supabase dashboard -> SQL Editor -> paste -> Run.
-- Recommended order: Step 0 (audit), Step 1-3 (fix), Step 4 (verify).
-- Re-runnable: policies are dropped before being recreated.
-- No data is deleted. Every statement is additive or a policy swap.
--
-- DEMO SAFETY: /demo and the Brewery Cafe / Cubig Furniture flows do not
-- read Supabase — demo data comes from src/lib/demo/fixtures.ts plus an
-- httpOnly cookie store. Enabling RLS cannot break either demo.


-- ---------------------------------------------------------------------------
-- Step 0 — AUDIT: what is protected right now? (read-only; run first)
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
     WHERE p.tablename = c.relname AND p.schemaname = 'public') AS policy_count,
  (SELECT string_agg(DISTINCT tp.grantee, ', ')
     FROM information_schema.table_privileges tp
    WHERE tp.table_name = c.relname
      AND tp.table_schema = 'public'
      AND tp.privilege_type = 'SELECT') AS select_grantees
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
ORDER BY c.relname;

-- Step 0b — PREFLIGHT: the policies in Step 3 assume these columns exist.
-- Confirm before running, or the CREATE POLICY statements will fail.
-- brand_members MUST supply user_id, brand_id and is_active.
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('brand_members','brands','brand_settings','orders',
                     'order_items','payments','offers','customers','products')
GROUP BY table_name
ORDER BY table_name;
-- If brand_members lacks is_active, replace
--   coalesce(bm.is_active, true)
-- with   true
-- in the Step 3 policies (is_active is optional in docs/DATABASE_CONTRACT.md).


-- ---------------------------------------------------------------------------
-- Step 1 — Enable RLS on every tenant table that exists today
-- ---------------------------------------------------------------------------
ALTER TABLE public.brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Step 2 — Remove the public (anon) read path entirely
--
-- Supabase grants SELECT/INSERT/UPDATE/DELETE on new public tables to the
-- anon role by default. REVOKE closes that at the privilege layer so a
-- future policy mistake cannot re-expose data to the browser.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'brands','brand_members','brand_settings','products','customers',
    'orders','order_items','offers','payments'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- Step 3 — Tenant isolation policies
--
-- Design note: membership is resolved as a plain subquery on
-- brand_members (security INVOKER), not a SECURITY DEFINER
-- current_brand_id() function with LIMIT 1. Two reasons:
--   1. No definer function means no search_path hijack surface and no
--      privileged bypass of brand_members RLS.
--   2. LIMIT 1 is unsafe the moment one user holds two memberships: the
--      helper could pick brand B while the request targets brand A. A
--      set-membership test admits exactly the brands the user belongs to.
-- brand_members' own policy references only auth.uid(), so there is no
-- RLS recursion.
-- ---------------------------------------------------------------------------

-- Drop first so the script is re-runnable.
DROP POLICY IF EXISTS brand_members_select ON public.brand_members;
DROP POLICY IF EXISTS brands_select        ON public.brands;
DROP POLICY IF EXISTS brand_settings_all   ON public.brand_settings;
DROP POLICY IF EXISTS products_all         ON public.products;
DROP POLICY IF EXISTS customers_all        ON public.customers;
DROP POLICY IF EXISTS orders_all           ON public.orders;
DROP POLICY IF EXISTS order_items_all      ON public.order_items;
DROP POLICY IF EXISTS offers_all           ON public.offers;
DROP POLICY IF EXISTS payments_all         ON public.payments;

-- A user may see their own membership rows. This is what every policy below
-- reads through.
CREATE POLICY brand_members_select ON public.brand_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A user may see the brands they belong to.
CREATE POLICY brands_select ON public.brands
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

-- brand_settings: read + update own brand's settings (the app writes
-- quotation_builder_enabled / receipt fields here).
CREATE POLICY brand_settings_all ON public.brand_settings
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY products_all ON public.products
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY customers_all ON public.customers
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY orders_all ON public.orders
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY order_items_all ON public.order_items
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY offers_all ON public.offers
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY payments_all ON public.payments
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));


-- ---------------------------------------------------------------------------
-- Step 4 — VERIFY after running (expect: all rls_enabled = true,
-- policy_count > 0, select_grantees no longer includes anon)
-- ---------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity,
  (SELECT count(*) FROM pg_policies p
     WHERE p.tablename = c.relname AND p.schemaname='public') AS policy_count,
  (SELECT string_agg(DISTINCT tp.grantee, ', ')
     FROM information_schema.table_privileges tp
    WHERE tp.table_name = c.relname AND tp.table_schema='public'
      AND tp.privilege_type='SELECT') AS select_grantees
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind='r'
  AND c.relname IN ('brands','brand_members','brand_settings','products',
                    'customers','orders','order_items','offers','payments')
ORDER BY c.relname;

-- Plus the external check the app cannot fake (run from a terminal):
--   set -a; . ./.env.local; set +a
--   curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/customers?select=*&limit=1" \
--     -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
--     -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
-- Expect 401/403 (we revoked anon) rather than a JSON array of customers.


-- ---------------------------------------------------------------------------
-- KNOWN CONSEQUENCES OF STEP 2 (deliberate, not regressions)
-- ---------------------------------------------------------------------------
-- * Public quote page /quote/[token] reads orders with the anon client
--   (src/services/data.ts -> getOrderByPublicToken). It stops working for
--   live data after this script. It is ALREADY broken: the live orders
--   table has no public_token column and the accept_quote_by_token RPC does
--   not exist. Do not re-open anon by guessing a policy — add a narrow
--   SECURITY DEFINER RPC (returns only token-scoped columns) instead.
--   Never use: CREATE POLICY ... TO anon USING (public_token IS NOT NULL)
--   as that lets anyone enumerate tokens and read whole order rows.


-- ---------------------------------------------------------------------------
-- STEP 5 — BLOCKERS FOR LIVE MODE (separate from RLS; decide deliberately)
--
-- These were confirmed by probing the live schema on 2026-11-06. Live mode
-- cannot work until the columns and RPCs match docs/DATABASE_CONTRACT.md.
--
-- A) brand_members has 0 rows. No Supabase user can pass the membership
--    check in loadLiveWorkspace, so live login is impossible. Grant yourself
--    membership (get your auth uid from dashboard -> Authentication ->
--    Users) before anything else:
--      INSERT INTO public.brand_members (id, brand_id, user_id, role, is_active)
--      VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000003',
--              '<your-auth-user-uuid>', 'owner', true);
--
-- B) Column-name drift between the live DB and src/types/database.ts.
--    Either rename columns to the contract or change the app to match:
--      brands.brand_code            vs app  brands.code
--      customers.customer_name      vs app  customers.name
--      customers.mobile_number      vs app  customers.phone
--      orders.order_status          vs app  orders.status
--      orders.total_amount          vs app  orders.grand_total
--      orders.item_discount_amount  vs app  orders.discount_total
--      orders.order_discount_amount   (no single app equivalent)
--      orders.tax_amount            vs app  orders.tax_total
--      orders.delivery_fee          vs app  orders.fees_total
--      orders.order_type            vs app  table_tag / delivery semantics
--    Additive columns the app needs that do not exist:
--      orders: public_token, parent_order_id, order_kind, deposit_percent,
--              offer_code_snapshot, amount_paid(exists), notes(exists)
--      products: image_url, stock_qty, low_stock_threshold, wholesale_price,
--              default_discount_percent, modifiers_json
--      customers: price_tier
--    Prefer ADD COLUMN over rename: a rename is a breaking change for
--    anything already querying the old name (ground rule 3 — additive,
--    reversible). If you rename instead, keep a view of the old name.
--
-- C) Missing tables the app writes to: refunds, stock_adjustments,
--    offer_products, offer_categories, offer_redemptions (all 404).
--    After creating them, re-run Steps 1-3 for each so they are not born
--    unprotected.
--
-- D) Missing RPCs (all 404): create_order, accept_quote_by_token,
--    analytics_orders_snapshot, resolve_brand_auth_email.
--    Until create_order exists the app falls back to submitOrderViaTables
--    (SECURITY_REMAINING_RISKS.md, P1). RLS does not validate prices,
--    stock, or discount limits — only the RPC does, so the table fallback
--    must stay off in production.
--
-- E) Money columns are numeric-with-decimals as returned to the app and
--    mapped straight to TypeScript number. This is the float-money issue
--    in the improvements doc (item 2). Fixing it means migrating to
--    integer minor units, which is a planned change, not part of this
--    security fix.
