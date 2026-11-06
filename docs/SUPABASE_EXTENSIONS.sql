-- OrderBook optional extensions (run in Supabase SQL editor — not from the app).
-- Adjust column names if your schema already differs.

-- Optional columns (products)
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_qty numeric;
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold numeric;
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price numeric;
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS modifiers_json jsonb;

-- Optional columns (customers)
-- ALTER TABLE customers ADD COLUMN IF NOT EXISTS price_tier text DEFAULT 'retail';

-- Optional columns (orders)
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token text UNIQUE;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES orders(id);
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT 0;
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_kind text DEFAULT 'sale';

-- Optional columns (payments)
-- ALTER TABLE payments ADD COLUMN IF NOT EXISTS split_label text;
-- ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes text;

-- CREATE TABLE IF NOT EXISTS refunds (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   brand_id uuid NOT NULL REFERENCES brands(id),
--   order_id uuid NOT NULL REFERENCES orders(id),
--   payment_id uuid REFERENCES payments(id),
--   amount numeric NOT NULL CHECK (amount > 0),
--   reason text,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );

-- CREATE TABLE IF NOT EXISTS stock_adjustments (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   brand_id uuid NOT NULL REFERENCES brands(id),
--   product_id uuid NOT NULL REFERENCES products(id),
--   delta_qty numeric NOT NULL,
--   reason text NOT NULL,
--   created_at timestamptz NOT NULL DEFAULT now()
-- );

-- Public quote accept (callable by anon + authenticated)
CREATE OR REPLACE FUNCTION accept_quote_by_token(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 8 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT * INTO v_order
  FROM orders
  WHERE public_token = trim(p_token)
    AND status = 'draft'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE orders
  SET status = 'confirmed'
  WHERE id = v_order.id;

  RETURN json_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'brand_id', v_order.brand_id
  );
END;
$$;

REVOKE ALL ON FUNCTION accept_quote_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_quote_by_token(text) TO anon, authenticated;

-- Analytics aggregate for a brand member (authenticated only)
CREATE OR REPLACE FUNCTION analytics_orders_snapshot(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_id uuid;
  v_result json;
BEGIN
  SELECT bm.brand_id INTO v_brand_id
  FROM brand_members bm
  WHERE bm.user_id = auth.uid()
    AND coalesce(bm.is_active, true)
  LIMIT 1;

  IF v_brand_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    'order_count', count(*)::int,
    'net_sales', coalesce(sum(grand_total), 0),
    'discount_total', coalesce(sum(discount_total), 0),
    'paid_amount', coalesce(sum(grand_total) FILTER (WHERE payment_status = 'paid'), 0),
    'pending_amount', coalesce(sum(grand_total) FILTER (WHERE payment_status <> 'paid'), 0)
  )
  INTO v_result
  FROM orders
  WHERE brand_id = v_brand_id
    AND created_at >= p_from
    AND created_at < p_to
    AND coalesce(order_kind, 'sale') = 'sale';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION analytics_orders_snapshot(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics_orders_snapshot(timestamptz, timestamptz) TO authenticated;
