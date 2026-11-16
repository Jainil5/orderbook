-- OrderBook — CRM module schema (Supabase / Postgres)
--
-- WHAT THIS IS
--   The 11 tables the CRM module owns, with row-level security on the same
--   brand-membership rule the rest of the database already uses
--   (docs/SUPABASE_RLS_APPLY.sql). Column names and nullability match
--   src/lib/csv/schema.ts exactly, and both match src/types/crm.ts, so
--   CsvCrmRepository and SupabaseCrmRepository in src/lib/crm/repository.ts
--   read and write the identical row shape.
--
-- WHAT THIS IS NOT
--   Nothing in the app runs this file. Per docs/DATABASE_CONTRACT.md the app
--   never creates or migrates tables. The operator runs it in Supabase
--   dashboard -> SQL Editor -> paste -> Run, and only then flips
--   OB_USE_SUPABASE="true" (.env.example). Until both happen, the CRM works
--   entirely from data/*.csv and this file changes nothing.
--
-- STATUS: written, not applied, not tested against a live project.
--   Two deliberate differences from the CSV layer are listed under
--   "BEFORE YOU FLIP THE SWITCH" below. Read them first.
--
-- Re-runnable: every object is created with IF NOT EXISTS and every policy is
-- dropped before it is recreated. No statement deletes rows.

-- ---------------------------------------------------------------------------
-- Step 1 — Tables
-- ---------------------------------------------------------------------------

-- Lead pipeline. `stage` is the owner's vocabulary, not a guess:
-- new | site_visit | quote_sent | negotiating | won | lost.
CREATE TABLE IF NOT EXISTS public.leads (
  id                  text PRIMARY KEY,
  brand_id            text NOT NULL,
  name                text NOT NULL,
  company             text,
  phone               text,
  email               text,
  source              text,
  stage               text NOT NULL DEFAULT 'new',
  -- Ranking value the owner typed. Never booked as revenue, never summed into
  -- an order total anywhere in the app.
  estimated_value     numeric(14, 2) NOT NULL DEFAULT 0,
  assigned_staff_id   text,
  next_follow_up_at   timestamptz,
  notes               text,
  lost_reason         text,
  -- Set once, when a human converts the lead. The customer is created through
  -- the app's existing customer path, so this points at it and never duplicates
  -- it. ON DELETE behaviour is handled in the action, not the database.
  customer_id         text,
  converted_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_stage_check
    CHECK (stage IN ('new', 'site_visit', 'quote_sent', 'negotiating', 'won', 'lost')),
  CONSTRAINT leads_value_check CHECK (estimated_value >= 0)
);

-- Every touch with a person, whatever it was.
CREATE TABLE IF NOT EXISTS public.customer_interactions (
  id                 text PRIMARY KEY,
  brand_id           text NOT NULL,
  customer_id        text,
  lead_id            text,
  type               text NOT NULL,
  subject            text,
  description        text NOT NULL,
  occurred_at        timestamptz NOT NULL,
  staff_id           text,
  outcome            text,
  next_follow_up_at  timestamptz,
  -- [{ name, href }] — upload itself is not implemented, so this stays null.
  attachments        jsonb,
  -- Productivity task id when a follow-up became one real task.
  task_id            text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interactions_type_check CHECK (type IN (
    'call', 'whatsapp', 'email', 'meeting', 'store_visit',
    'appointment', 'note', 'complaint', 'follow_up')),
  -- A touch is about somebody: at least one of the two must be set.
  CONSTRAINT interactions_subject_check CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);

-- Reviews collected by hand or from a public source. `sentiment` is derived by
-- classifyReviewSentiment (src/lib/crm/metrics.ts) and stored as a label; it
-- is not a model's opinion and can be corrected by a person.
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id                text PRIMARY KEY,
  brand_id          text NOT NULL,
  source            text NOT NULL,
  rating            numeric(3, 2) NOT NULL,
  text              text NOT NULL,
  reviewer_name     text,
  customer_id       text,
  review_date       timestamptz NOT NULL,
  sentiment         text,
  tags              jsonb,
  response_status   text NOT NULL DEFAULT 'unanswered',
  response_text     text,
  responded_at      timestamptz,
  internal_notes    text,
  staff_mentioned   text,
  complaint_id      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT reviews_sentiment_check CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  CONSTRAINT reviews_response_check CHECK (response_status IN ('unanswered', 'answered', 'escalated')),
  CONSTRAINT reviews_source_check CHECK (source IN (
    'in_store', 'whatsapp', 'email', 'phone', 'google', 'other'))
);

-- A complaint is a review (or call, or visit) a person decided needs tracking.
-- Nothing here escalates by itself; `opened_at` is when the record was made.
CREATE TABLE IF NOT EXISTS public.customer_complaints (
  id                 text PRIMARY KEY,
  brand_id           text NOT NULL,
  customer_id        text,
  lead_id            text,
  review_id          text,
  interaction_id     text,
  subject            text NOT NULL,
  description        text,
  severity           text NOT NULL DEFAULT 'medium',
  status             text NOT NULL DEFAULT 'open',
  assigned_staff_id  text,
  resolution_notes   text,
  opened_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT complaints_severity_check CHECK (severity IN ('low', 'medium', 'high')),
  CONSTRAINT complaints_status_check CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

-- Segments are saved filters (dynamic) or hand-picked lists (manual).
-- Dynamic membership is recomputed on every read (segmentCustomerIds), so
-- `rules` is the only stored truth and no member list is kept for it.
CREATE TABLE IF NOT EXISTS public.customer_segments (
  id                  text PRIMARY KEY,
  brand_id            text NOT NULL,
  name                text NOT NULL,
  description         text,
  kind                text NOT NULL DEFAULT 'dynamic',
  rules               jsonb NOT NULL DEFAULT '{}'::jsonb,
  manual_customer_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segments_kind_check CHECK (kind IN ('dynamic', 'manual')),
  CONSTRAINT segments_name_unique UNIQUE (brand_id, name)
);

-- Marketing campaigns. The five count columns are tallies of recorded
-- recipient states, written only by recountCampaign; no screen lets a user
-- type them and nothing here marks a message as delivered.
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id                  text PRIMARY KEY,
  brand_id            text NOT NULL,
  name                text NOT NULL,
  description         text,
  type                text NOT NULL DEFAULT 'offer',
  channel             text NOT NULL DEFAULT 'in_store',
  segment_id          text,
  offer_id            text,
  status              text NOT NULL DEFAULT 'draft',
  start_date          date NOT NULL,
  end_date            date,
  consent_only        boolean NOT NULL DEFAULT true,
  targeted_count      integer NOT NULL DEFAULT 0,
  marked_sent_count   integer NOT NULL DEFAULT 0,
  response_count      integer NOT NULL DEFAULT 0,
  redemption_count    integer NOT NULL DEFAULT 0,
  revenue_attributed  numeric(14, 2) NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_type_check CHECK (type IN (
    'offer', 'announcement', 'reminder', 'winback', 'loyalty')),
  CONSTRAINT campaigns_channel_check CHECK (channel IN ('whatsapp', 'email', 'sms', 'in_store')),
  CONSTRAINT campaigns_status_check CHECK (status IN (
    'draft', 'scheduled', 'active', 'completed', 'cancelled'))
);

-- One row per person the campaign actually covered. `consent_only = true`
-- means a row can only exist for a customer whose marketing_consent is
-- 'granted' and who has not opted out — enforced in consentedCustomerIds,
-- because that is where the customer columns live.
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id              text PRIMARY KEY,
  brand_id        text NOT NULL,
  campaign_id     text NOT NULL,
  customer_id     text,
  lead_id         text,
  status          text NOT NULL DEFAULT 'selected',
  marked_sent_at  timestamptz,
  responded_at    timestamptz,
  redeemed_at     timestamptz,
  order_id        text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipients_status_check CHECK (status IN (
    'selected', 'marked_sent', 'responded', 'redeemed', 'opted_out')),
  -- A person appears in a campaign once; a rebuild updates that row rather
  -- than adding a second one.
  CONSTRAINT recipients_once_per_campaign UNIQUE (campaign_id, customer_id)
);

-- Loyalty balances. `tier` is a label from the brand's own tier ladder in
-- crm_settings.loyalty, derived by tierForLifetimePoints — there is no
-- built-in Gold/Silver model in this schema.
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  id               text PRIMARY KEY,
  brand_id         text NOT NULL,
  customer_id      text NOT NULL,
  points_balance   integer NOT NULL DEFAULT 0,
  lifetime_points  integer NOT NULL DEFAULT 0,
  tier             text,
  last_activity_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_one_account_per_customer UNIQUE (brand_id, customer_id)
);

-- The ledger. `balance_after` is stored on every row so a balance can be
-- re-derived without trusting the account cache.
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id             text PRIMARY KEY,
  brand_id       text NOT NULL,
  account_id     text NOT NULL,
  customer_id    text NOT NULL,
  kind           text NOT NULL,
  points         integer NOT NULL,
  balance_after  integer NOT NULL,
  reason         text,
  order_id       text,
  expires_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_kind_check CHECK (kind IN ('earn', 'redeem', 'expire', 'adjust', 'bonus')),
  CONSTRAINT loyalty_points_check CHECK (points <> 0)
);

-- Memberships are the business's own plans: the name, price and benefits are
-- stored text, not an enum. Paying for one is a normal order/payment.
CREATE TABLE IF NOT EXISTS public.memberships (
  id          text PRIMARY KEY,
  brand_id    text NOT NULL,
  customer_id text NOT NULL,
  plan        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  auto_renew  boolean NOT NULL DEFAULT false,
  benefits    jsonb NOT NULL DEFAULT '[]'::jsonb,
  price       numeric(14, 2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_status_check CHECK (status IN (
    'active', 'paused', 'expired', 'cancelled'))
);

-- One row per brand: the loyalty model, and the pick-lists that let the CRM
-- fit a cafe, a furniture workshop or a clinic without a code change.
CREATE TABLE IF NOT EXISTS public.crm_settings (
  id             text PRIMARY KEY,
  brand_id       text NOT NULL,
  loyalty        jsonb NOT NULL,
  lead_sources   jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_settings_one_row_per_brand UNIQUE (brand_id)
);

-- ---------------------------------------------------------------------------
-- Step 2 — Indexes for the reads the CRM actually performs
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS leads_brand_stage      ON public.leads (brand_id, stage);
CREATE INDEX IF NOT EXISTS leads_brand_follow_up  ON public.leads (brand_id, next_follow_up_at);
CREATE INDEX IF NOT EXISTS leads_brand_customer   ON public.leads (brand_id, customer_id);

CREATE INDEX IF NOT EXISTS interactions_brand_customer
  ON public.customer_interactions (brand_id, customer_id);
CREATE INDEX IF NOT EXISTS interactions_brand_lead
  ON public.customer_interactions (brand_id, lead_id);
CREATE INDEX IF NOT EXISTS interactions_brand_follow_up
  ON public.customer_interactions (brand_id, next_follow_up_at);

CREATE INDEX IF NOT EXISTS reviews_brand_status
  ON public.customer_reviews (brand_id, response_status);
CREATE INDEX IF NOT EXISTS reviews_brand_customer
  ON public.customer_reviews (brand_id, customer_id);
CREATE INDEX IF NOT EXISTS reviews_brand_date
  ON public.customer_reviews (brand_id, review_date DESC);

CREATE INDEX IF NOT EXISTS complaints_brand_status
  ON public.customer_complaints (brand_id, status);
CREATE INDEX IF NOT EXISTS complaints_brand_customer
  ON public.customer_complaints (brand_id, customer_id);

CREATE INDEX IF NOT EXISTS segments_brand ON public.customer_segments (brand_id);

CREATE INDEX IF NOT EXISTS campaigns_brand_status
  ON public.marketing_campaigns (brand_id, status);
CREATE INDEX IF NOT EXISTS campaigns_brand_segment
  ON public.marketing_campaigns (brand_id, segment_id);

CREATE INDEX IF NOT EXISTS recipients_brand_campaign
  ON public.campaign_recipients (brand_id, campaign_id);

CREATE INDEX IF NOT EXISTS loyalty_accounts_brand
  ON public.loyalty_accounts (brand_id, customer_id);
CREATE INDEX IF NOT EXISTS loyalty_tx_brand_account
  ON public.loyalty_transactions (brand_id, account_id);
CREATE INDEX IF NOT EXISTS loyalty_tx_brand_customer
  ON public.loyalty_transactions (brand_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_tx_brand_order
  ON public.loyalty_transactions (brand_id, order_id);

CREATE INDEX IF NOT EXISTS memberships_brand_customer
  ON public.memberships (brand_id, customer_id);

-- ---------------------------------------------------------------------------
-- Step 3 — Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_complaints  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_segments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings         ENABLE ROW LEVEL SECURITY;

-- Same as Step 2 of docs/SUPABASE_RLS_APPLY.sql: close the anon path at the
-- privilege layer, so a later policy mistake cannot make a CRM table readable
-- from the browser bundle.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'leads', 'customer_interactions', 'customer_reviews', 'customer_complaints',
    'customer_segments', 'marketing_campaigns', 'campaign_recipients',
    'loyalty_accounts', 'loyalty_transactions', 'memberships', 'crm_settings'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4 — Tenant isolation policies
--
-- Identical rule to every other brand-owned table: a member of brand B can
-- read and write rows whose brand_id is B, resolved through brand_members
-- (security INVOKER, no definer function, no LIMIT 1). The server code also
-- filters on brand_id (src/lib/crm/repository.ts), so tenancy is enforced
-- twice.
--
-- `is_active` is honoured, so a removed member stops matching immediately and
-- their own past CRM writes stop being reachable.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS leads_all                ON public.leads;
DROP POLICY IF EXISTS customer_interactions_all ON public.customer_interactions;
DROP POLICY IF EXISTS customer_reviews_all     ON public.customer_reviews;
DROP POLICY IF EXISTS customer_complaints_all  ON public.customer_complaints;
DROP POLICY IF EXISTS customer_segments_all    ON public.customer_segments;
DROP POLICY IF EXISTS marketing_campaigns_all  ON public.marketing_campaigns;
DROP POLICY IF EXISTS campaign_recipients_all  ON public.campaign_recipients;
DROP POLICY IF EXISTS loyalty_accounts_all     ON public.loyalty_accounts;
DROP POLICY IF EXISTS loyalty_transactions_all ON public.loyalty_transactions;
DROP POLICY IF EXISTS memberships_all          ON public.memberships;
DROP POLICY IF EXISTS crm_settings_all         ON public.crm_settings;

CREATE POLICY leads_all ON public.leads
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY customer_interactions_all ON public.customer_interactions
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY customer_reviews_all ON public.customer_reviews
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY customer_complaints_all ON public.customer_complaints
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY customer_segments_all ON public.customer_segments
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY marketing_campaigns_all ON public.marketing_campaigns
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY campaign_recipients_all ON public.campaign_recipients
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY loyalty_accounts_all ON public.loyalty_accounts
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY loyalty_transactions_all ON public.loyalty_transactions
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY memberships_all ON public.memberships
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

CREATE POLICY crm_settings_all ON public.crm_settings
  FOR ALL TO authenticated
  USING (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)))
  WITH CHECK (brand_id IN (
    SELECT bm.brand_id FROM public.brand_members bm
     WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active, true)));

-- ---------------------------------------------------------------------------
-- Step 5 — Verify (read-only)
-- ---------------------------------------------------------------------------
SELECT relname, relrowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN (
    'leads', 'customer_interactions', 'customer_reviews', 'customer_complaints',
    'customer_segments', 'marketing_campaigns', 'campaign_recipients',
    'loyalty_accounts', 'loyalty_transactions', 'memberships', 'crm_settings')
ORDER BY relname;

SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'leads', 'customer_interactions', 'customer_reviews', 'customer_complaints',
    'customer_segments', 'marketing_campaigns', 'campaign_recipients',
    'loyalty_accounts', 'loyalty_transactions', 'memberships', 'crm_settings')
ORDER BY tablename;

-- ---------------------------------------------------------------------------
-- BEFORE YOU FLIP OB_USE_SUPABASE (both are real gaps, not tidy-ups)
--
-- 1. Timestamp and id types. This file uses timestamptz/date and text ids;
--    the CSV layer stores ISO strings and, in the demo packs, hand-written ids
--    like `bc-lead-1`. Postgres accepts the ISO text on write, but reads come
--    back normalised (`2026-11-17T00:00:00+00:00`), which the CRM's
--    `.slice(0, 10)` date displays and string comparisons were not written
--    for. SupabaseCrmRepository must normalise every timestamp column back to
--    the ISO shape used in CSV before any live CRM screen is trusted.
-- 2. No cross-table foreign keys. `customers.id` / `orders.id` in the live
--    database are uuid; the CRM columns above are text and are validated in
--    code against ids the brand really owns (crmRefs + refId in
--    src/lib/business/validate.ts). Adding FKs means choosing matching id
--    types for the whole CRM, which is a schema decision for the operator,
--    not something this file assumes.
--
-- Nothing in src/ reads these tables yet: SupabaseCrmRepository only becomes
-- reachable when supabaseEnabled() is true (src/lib/env.ts) and a live
-- workspace session exists.
-- ---------------------------------------------------------------------------
