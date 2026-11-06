-- Recommended Row Level Security baseline for OrderBook (apply in Supabase SQL editor).
-- Adjust policy names if your project already defines equivalents.

-- Enable RLS on all tenant tables
-- ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE brand_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE brand_settings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- Helper: active brand for authenticated user
-- CREATE OR REPLACE FUNCTION public.current_brand_id()
-- RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
--   SELECT bm.brand_id FROM brand_members bm
--   WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)
--   LIMIT 1;
-- $$;

-- Example tenant isolation (products)
-- CREATE POLICY products_select ON products FOR SELECT TO authenticated
--   USING (brand_id = public.current_brand_id());
-- CREATE POLICY products_write ON products FOR ALL TO authenticated
--   USING (brand_id = public.current_brand_id())
--   WITH CHECK (brand_id = public.current_brand_id());

-- Public quote read: minimal exposure via token only (prefer a SECURITY DEFINER view)
-- CREATE POLICY orders_public_quote_select ON orders FOR SELECT TO anon, authenticated
--   USING (public_token IS NOT NULL AND status = 'draft');

-- Never grant broad anon SELECT on orders without token predicate.
