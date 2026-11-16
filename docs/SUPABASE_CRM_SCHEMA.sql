-- ============================================================================
-- OrderBook — CRM schema for Supabase (Postgres)
-- ============================================================================
--
-- ⚠️  THIS FILE IS NOT WIRED TO ANYTHING.
--
-- The shipped app is a self-contained demo: it reads `data/demo/<brand>/*.csv`
-- at build time and keeps visitor edits in per-browser httpOnly cookies
-- (`src/lib/demo/mutable-store.ts`). Nothing in `src/` imports, executes,
-- connects to, or otherwise knows about this file. It exists so that when the
-- CRM moves onto a real database, the tenancy, foreign keys and row-level
-- security are already agreed rather than invented under time pressure — and
-- so a reviewer can check the intended rules without running anything.
--
-- To use it for real:
--   1. `brands`, `users`, `brand_members`, `customers`, `orders`, `payments`,
--      `leads` and `staff` must already exist (core app tables). This file
--      only adds the CRM tables and the CRM columns on `customers`.
--   2. Copy each statement into its own Supabase migration
--      (`supabase migration new crm_…`) rather than running the file whole —
--      it is written to be idempotent, not to be a single transaction.
--   3. Replace `app.user_brand_ids()` with the real claim lookup once auth is
--      in place, and re-test every policy as both an owner and a staff member.
--
-- Conventions this schema keeps, in the same order the app enforces them:
--   • every row carries `brand_id`, and every policy filters on it — a query
--     that forgets tenancy must return nothing, not everything;
--   • the application layer (src/lib/crm/*) owns the business rules; the
--     CHECK constraints below repeat the invariants that must never be broken
--     by any other writer, so a bad row cannot exist even if an app bug lets
--     one through;
--   • money is integer minor units ×100 where a currency amount is stored,
--     matching the app's whole-unit rounding only where the app also rounds.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Tenancy helper
-- ----------------------------------------------------------------------------

-- Which brands the current JWT may see. A user with no membership reads nothing.
create or replace function app.user_brand_ids()
returns setof text
language sql
stable
as $$
  select bm.brand_id
  from public.brand_members bm
  where bm.user_id = (auth.jwt() ->> 'sub')::uuid;
$$;

-- Staff may write the rows their role touches; a brand owner may write all of
-- them. Kept as one function so every policy reads the same rule.
create or replace function app.can_write_brand(brand_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.brand_members bm
    where bm.user_id = (auth.jwt() ->> 'sub')::uuid
      and bm.brand_id = app.can_write_brand.brand_id
      and bm.role in ('owner', 'admin', 'staff')
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. CRM columns on the customer record billing already owns
-- ----------------------------------------------------------------------------
-- The CRM deliberately does not have its own customer table: one person, one
-- row, one id, so a bill and a campaign recipient are the same entity.

alter table public.customers
  add column if not exists status             text not null default 'active',
  add column if not exists source             text,
  add column if not exists tags               text[] not null default '{}',
  add column if not exists address            text,
  add column if not exists date_of_birth      date,
  add column if not exists gender             text,
  add column if not exists marketing_consent  boolean not null default false,
  add column if not exists opted_out          boolean not null default false,
  add column if not exists custom_fields      jsonb;

alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers
  add constraint customers_status_check
  check (status in ('active', 'inactive', 'archived'));

alter table public.customers drop constraint if exists customers_gender_check;
alter table public.customers
  add constraint customers_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));

-- Free-form fields are an object or nothing, so a reader never has to guess
-- whether `custom_fields` holds a list, a string or a half-saved form.
alter table public.customers drop constraint if exists customers_custom_fields_check;
alter table public.customers
  add constraint customers_custom_fields_check
  check (custom_fields is null or jsonb_typeof(custom_fields) = 'object');

-- Consent needs no constraint: `marketing_consent` is opt-in and `opted_out`
-- is checked first by every audience query (audienceForSegment), so a row that
-- carries both is legal and still resolves to "do not message".

create index if not exists customers_brand_status_idx
  on public.customers (brand_id, status);
create index if not exists customers_brand_tags_idx
  on public.customers using gin (tags);
create index if not exists customers_brand_phone_idx
  on public.customers (brand_id, phone);
create index if not exists customers_brand_email_idx
  on public.customers (brand_id, lower(email));
create index if not exists customers_brand_dob_month_idx
  on public.customers (brand_id, extract(month from date_of_birth));

-- ----------------------------------------------------------------------------
-- 2. Interactions — the contact log
-- ----------------------------------------------------------------------------

create table if not exists public.crm_interactions (
  id                 text primary key,
  brand_id           text not null references public.brands (id) on delete cascade,
  -- Exactly one of the two: a touchpoint is either against a billing customer
  -- or against an enquiry that has not converted yet.
  customer_id        text references public.customers (id) on delete cascade,
  lead_id            text references public.leads (id) on delete cascade,
  type               text not null,
  summary            text not null check (char_length(summary) between 1 and 200),
  detail             text check (detail is null or char_length(detail) <= 2000),
  occurred_at        timestamptz not null,
  staff_id           text references public.staff (id) on delete set null,
  outcome            text check (outcome is null or char_length(outcome) <= 160),
  next_follow_up_at  timestamptz,
  -- Set once a follow-up has been handed to the Productivity Manager as a
  -- task; the back-reference is what stops a second press making a second task.
  task_id            text,
  attachment_url     text check (attachment_url is null or attachment_url ~ '^https?://'),
  created_at         timestamptz not null default now(),
  constraint crm_interactions_one_subject check (
    (customer_id is not null)::int + (lead_id is not null)::int = 1
  ),
  constraint crm_interactions_type_check check (type in (
    'call', 'whatsapp', 'email', 'meeting', 'store_visit',
    'appointment', 'note', 'complaint', 'follow_up'
  )),
  constraint crm_interactions_follow_up_after check (
    next_follow_up_at is null or next_follow_up_at > occurred_at
  )
);

create index if not exists crm_interactions_brand_customer_idx
  on public.crm_interactions (brand_id, customer_id, occurred_at desc);
create index if not exists crm_interactions_brand_lead_idx
  on public.crm_interactions (brand_id, lead_id, occurred_at desc);
-- The follow-up queue: only open rows, in the order they fall due.
create index if not exists crm_interactions_brand_due_idx
  on public.crm_interactions (brand_id, next_follow_up_at)
  where next_follow_up_at is not null and task_id is null;

-- ----------------------------------------------------------------------------
-- 3. Reviews
-- ----------------------------------------------------------------------------
-- `sentiment` is written by the deterministic lexicon scorer in the app, never
-- by a model and never by a trigger, so the same text always scores the same.

create table if not exists public.crm_reviews (
  id              text primary key,
  brand_id        text not null references public.brands (id) on delete cascade,
  customer_id     text references public.customers (id) on delete set null,
  source          text not null,
  rating          smallint not null check (rating between 1 and 5),
  text            text not null check (char_length(text) between 1 and 2000),
  reviewed_at     timestamptz not null,
  response_text   text check (response_text is null or char_length(response_text) <= 2000),
  responded_at    timestamptz,
  sentiment       text not null default 'neutral'
                    check (sentiment in ('positive', 'neutral', 'negative')),
  tags            text[] not null default '{}',
  staff_mentioned text,
  internal_notes  text check (internal_notes is null or char_length(internal_notes) <= 1000),
  status          text not null default 'new'
                    check (status in ('new', 'acknowledged', 'escalated', 'closed')),
  complaint_id    text,
  constraint crm_reviews_reply_consistent check (
    (response_text is null) or (responded_at is not null)
  )
);

create index if not exists crm_reviews_brand_recent_idx
  on public.crm_reviews (brand_id, reviewed_at desc);
-- The unanswered inbox is the default view, so it gets its own partial index.
create index if not exists crm_reviews_brand_unanswered_idx
  on public.crm_reviews (brand_id, reviewed_at desc)
  where response_text is null;
create index if not exists crm_reviews_brand_customer_idx
  on public.crm_reviews (brand_id, customer_id);
create index if not exists crm_reviews_brand_rating_idx
  on public.crm_reviews (brand_id, rating) where rating <= 3;

-- ----------------------------------------------------------------------------
-- 4. Complaints
-- ----------------------------------------------------------------------------

create table if not exists public.crm_complaints (
  id              text primary key,
  brand_id        text not null references public.brands (id) on delete cascade,
  customer_id     text references public.customers (id) on delete cascade,
  review_id       text references public.crm_reviews (id) on delete set null,
  interaction_id  text references public.crm_interactions (id) on delete set null,
  subject         text not null check (char_length(subject) between 1 and 160),
  detail          text check (detail is null or char_length(detail) <= 2000),
  severity        text not null default 'medium'
                    check (severity in ('low', 'medium', 'high')),
  status          text not null default 'open'
                    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  owner_staff_id  text references public.staff (id) on delete set null,
  raised_at       timestamptz not null default now(),
  resolved_at     timestamptz,
  -- Something cannot be resolved without a moment at which it was resolved,
  -- and cannot stay resolved in the past while still open now.
  constraint crm_complaints_resolution_consistent check (
    (status in ('resolved', 'closed')) = (resolved_at is not null)
  )
);

create index if not exists crm_complaints_brand_status_idx
  on public.crm_complaints (brand_id, status, raised_at desc);
create index if not exists crm_complaints_brand_customer_idx
  on public.crm_complaints (brand_id, customer_id);
create index if not exists crm_complaints_brand_high_severity_idx
  on public.crm_complaints (brand_id, raised_at)
  where severity = 'high' and status in ('open', 'in_progress');

-- ----------------------------------------------------------------------------
-- 5. Segments
-- ----------------------------------------------------------------------------
-- A dynamic segment stores *rules*, never a member list: membership is a view
-- over live data, so it is correct tomorrow without a re-run job. Recomputation
-- happens in the app (`src/lib/crm/segments.ts`); the generated columns below
-- are only what Postgres can express without a function.

create table if not exists public.crm_segments (
  id           text primary key,
  brand_id     text not null references public.brands (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text not null default '' check (char_length(description) <= 300),
  kind         text not null check (kind in ('dynamic', 'manual')),
  rules        jsonb,
  member_ids   text[] not null default '{}',
  created_at   timestamptz not null default now(),
  constraint crm_segments_shape_check check (
    (kind = 'dynamic' and rules is not null and jsonb_typeof(rules) = 'object'
       and member_ids = '{}')
    or
    (kind = 'manual' and rules is null)
  )
);

create index if not exists crm_segments_brand_name_idx
  on public.crm_segments (brand_id, lower(name));

-- Membership of a manual segment has to stay honest about tenancy: an id from
-- another brand would leak through a filter.
create or replace function app.segment_members_in_brand()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'manual' and exists (
    select 1
    from unnest(new.member_ids) as m(id)
    left join public.customers c on c.id = m.id and c.brand_id = new.brand_id
    where c.id is null
  ) then
    raise exception 'segment % references a customer outside its brand', new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_segments_members_are_own_brand
  on public.crm_segments;
create trigger crm_segments_members_are_own_brand
  before insert or update of member_ids, brand_id
  on public.crm_segments
  for each row execute function app.segment_members_in_brand();

-- ----------------------------------------------------------------------------
-- 6. Campaigns
-- ----------------------------------------------------------------------------
-- `delivery` is the honest field: `not_connected` means this build cannot send
-- anything and every counter is zero; `manual_log` means a human typed what
-- they observed. There is deliberately no 'sent' state and no provider id —
-- a column that implies a message left the building would be a lie until a
-- messaging account is actually wired up.

create table if not exists public.crm_campaigns (
  id                 text primary key,
  brand_id           text not null references public.brands (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  description        text not null default '' check (char_length(description) <= 500),
  type               text not null check (type in (
    'offer', 'winback', 'retention', 'reputation', 'new_business',
    'birthday', 'event_invite', 'loyalty_promo'
  )),
  channel            text not null check (channel in ('whatsapp', 'email', 'sms', 'in_store')),
  segment_id         text references public.crm_segments (id) on delete set null,
  offer_id           text references public.offers (id) on delete set null,
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             text not null default 'draft'
                       check (status in ('draft', 'scheduled', 'active', 'paused',
                                         'completed', 'cancelled')),
  consent_required   boolean not null default true,
  messages_sent      integer not null default 0 check (messages_sent >= 0),
  delivered          integer not null default 0 check (delivered >= 0),
  responded          integer not null default 0 check (responded >= 0),
  redeemed           integer not null default 0 check (redeemed >= 0),
  revenue_attributed bigint not null default 0 check (revenue_attributed >= 0),
  delivery           text not null default 'not_connected'
                       check (delivery in ('not_connected', 'manual_log')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- A logged funnel may not invent a conversion rate above 100%. These are the
  -- same four comparisons validateResultInput() makes.
  constraint crm_campaigns_dates_check check (
    ends_at is null or starts_at is null or ends_at >= starts_at
  ),
  constraint crm_campaigns_funnel_check check (
    delivered <= messages_sent
    and responded <= messages_sent
    and redeemed <= responded
  ),
  -- Nothing can claim results while no account is connected.
  constraint crm_campaigns_delivery_honest check (
    delivery <> 'not_connected' or (messages_sent = 0 and delivered = 0
      and responded = 0 and redeemed = 0 and revenue_attributed = 0)
  )
);

create index if not exists crm_campaigns_brand_status_idx
  on public.crm_campaigns (brand_id, status, starts_at desc);
create index if not exists crm_campaigns_brand_segment_idx
  on public.crm_campaigns (brand_id, segment_id);

-- ----------------------------------------------------------------------------
-- 7. Loyalty — rules, ledger, memberships
-- ----------------------------------------------------------------------------
-- The programme is data, not code: a café earns per rupee spent and expires
-- yearly, a furniture studio earns per order and never expires. One rules row
-- per brand is what makes both work on the same screens.

create table if not exists public.crm_loyalty_rules (
  brand_id              text primary key references public.brands (id) on delete cascade,
  earn_mode             text not null check (earn_mode in ('per_amount', 'per_order')),
  earn_amount_per_point numeric(14, 2) not null default 0 check (earn_amount_per_point >= 0),
  earn_points_per_order integer not null default 0 check (earn_points_per_order >= 0),
  point_value           numeric(10, 2) not null check (point_value > 0),
  expiry_days           integer check (expiry_days is null or expiry_days >= 1),
  redemption_enabled    boolean not null default true,
  -- Tiers stay in the rules row as JSON so a tier rename cannot orphan a
  -- ledger entry; membership rows still FK to tier ids by value.
  tiers                 jsonb not null default '[]'::jsonb
                          check (jsonb_typeof(tiers) = 'array'),
  updated_at            timestamptz not null default now(),
  constraint crm_loyalty_rules_earn_check check (
    (earn_mode = 'per_amount' and earn_amount_per_point > 0)
    or (earn_mode = 'per_order' and earn_points_per_order > 0)
  )
);

create or replace function app.loyalty_tiers_well_formed()
returns trigger
language plpgsql
as $$
declare
  bad text;
begin
  select coalesce(t ->> 'name', t ->> 'id', '(unnamed)') into bad
  from jsonb_array_elements(new.tiers) t
  where coalesce(t ->> 'id', '') = ''
     or coalesce(t ->> 'name', '') = ''
     or (t ->> 'min_spend') is null
     or (t ->> 'discount_percent') is null
     or (t ->> 'min_spend')::numeric < 0
     or (t ->> 'discount_percent')::numeric not between 0 and 100
  limit 1;

  if bad is not null then
    raise exception 'tier "%" needs an id, a name, a spend floor and a discount of 0-100', bad;
  end if;

  if (select count(*) from jsonb_array_elements(new.tiers) t)
     <> (select count(distinct t ->> 'id') from jsonb_array_elements(new.tiers) t) then
    raise exception 'two tiers in the same programme share an id';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_loyalty_rules_tiers_valid on public.crm_loyalty_rules;
create trigger crm_loyalty_rules_tiers_valid
  before insert or update of tiers
  on public.crm_loyalty_rules
  for each row
  when (jsonb_typeof(new.tiers) = 'array')
  execute function app.loyalty_tiers_well_formed();

create table if not exists public.crm_loyalty_entries (
  id           text primary key,
  brand_id     text not null references public.brands (id) on delete cascade,
  customer_id  text not null references public.customers (id) on delete cascade,
  kind         text not null
                 check (kind in ('earn', 'redeem', 'adjust', 'expire', 'bonus')),
  -- Signed: awards are positive, removals negative. The app decides the sign
  -- from `kind`, never from what a keypad was given, and the constraint below
  -- makes sure a direct writer cannot break that either.
  points       integer not null check (points <> 0),
  reason       text not null check (char_length(reason) between 1 and 200),
  order_id     text references public.orders (id) on delete set null,
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint crm_loyalty_entries_sign_check check (
    (kind in ('earn', 'bonus') and points > 0)
    or (kind in ('redeem', 'expire') and points < 0)
    or (kind = 'adjust')
  ),
  -- Only a credit can lapse, so a removal never carries an expiry date.
  constraint crm_loyalty_entries_expiry_check check (
    expires_at is null or points > 0
  )
);

create index if not exists crm_loyalty_entries_brand_customer_idx
  on public.crm_loyalty_entries (brand_id, customer_id, created_at);
create index if not exists crm_loyalty_entries_brand_expiry_idx
  on public.crm_loyalty_entries (brand_id, expires_at)
  where expires_at is not null and points > 0;

-- The ledger is append-only by design: a mistake is corrected by another row,
-- which is what makes it usable as an audit trail.
create or replace function app.crm_loyalty_entries_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'loyalty ledger rows are append-only: % is blocked', lower(TG_OP)
    using errcode = '2F003';
end;
$$;

drop trigger if exists crm_loyalty_entries_no_rewrite on public.crm_loyalty_entries;
create trigger crm_loyalty_entries_no_rewrite
  before update or delete on public.crm_loyalty_entries
  for each row execute function app.crm_loyalty_entries_append_only();

create table if not exists public.crm_memberships (
  id           text primary key,
  brand_id     text not null references public.brands (id) on delete cascade,
  customer_id  text not null references public.customers (id) on delete cascade,
  -- Tier id is a value inside crm_loyalty_rules.tiers; the trigger below checks
  -- it, because a FK cannot point into a JSON array.
  tier_id      text not null,
  started_at   timestamptz not null default now(),
  expires_at   timestamptz,
  status       text not null default 'active'
                 check (status in ('active', 'expired', 'cancelled')),
  notes        text check (notes is null or char_length(notes) <= 300),
  created_at   timestamptz not null default now(),
  constraint crm_memberships_dates_check check (
    expires_at is null or expires_at > started_at
  )
);

-- Two live memberships for one person is always a bug; a cancelled or expired
-- one may sit beside its replacement as history.
create unique index if not exists crm_memberships_one_active_per_customer
  on public.crm_memberships (brand_id, customer_id)
  where status = 'active';

create index if not exists crm_memberships_brand_customer_idx
  on public.crm_memberships (brand_id, customer_id);

create or replace function app.membership_tier_exists()
returns trigger
language plpgsql
as $$
declare
  found boolean;
begin
  select exists (
    select 1
    from jsonb_array_elements(
      (select tiers from public.crm_loyalty_rules where brand_id = new.brand_id)
    ) t
    where t ->> 'id' = new.tier_id
  ) into found;

  if not found then
    raise exception 'membership tier % is not in the % programme',
      new.tier_id, new.brand_id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_memberships_tier_exists
  on public.crm_memberships;
create trigger crm_memberships_tier_exists
  before insert or update of tier_id, brand_id
  on public.crm_memberships
  for each row execute function app.membership_tier_exists();

-- An edited programme may not silently abandon members: the app refuses the
-- save when a tier still has one (saveLoyaltyRulesAction), and this stops any
-- other writer from doing what the UI will not.
create or replace function app.loyalty_rules_tiers_kept()
returns trigger
language plpgsql
as $$
declare
  abandoned integer;
begin
  select count(*) into abandoned
  from public.crm_memberships m
  where m.brand_id = new.brand_id
    and m.status = 'active'
    and not exists (
      select 1
      from jsonb_array_elements(new.tiers) t
      where t ->> 'id' = m.tier_id
    );

  if abandoned > 0 then
    raise exception '% active members sit on a tier this edit removes', abandoned;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_loyalty_rules_keeps_members
  on public.crm_loyalty_rules;
create trigger crm_loyalty_rules_keeps_members
  before update of tiers on public.crm_loyalty_rules
  for each row
  when (jsonb_typeof(new.tiers) = 'array')
  execute function app.loyalty_rules_tiers_kept();

-- ----------------------------------------------------------------------------
-- 8. Row level security
-- ----------------------------------------------------------------------------
-- Every CRM table gets the same three rules. Reads are limited to brands the
-- caller belongs to; writes additionally require a staff-level role. No policy
-- uses `using (true)`, and none trusts a `brand_id` coming from the client —
-- the `with check` clause re-tests it against membership, so a forged brand id
-- in a payload fails instead of landing in somebody else's tenant.

do $$
declare
  t text;
  tables text[] := array[
    'crm_interactions',
    'crm_reviews',
    'crm_complaints',
    'crm_segments',
    'crm_campaigns',
    'crm_memberships'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format('drop policy if exists "%s_brand_read" on public.%I', t, t);
    execute format($p$
      create policy "%s_brand_read" on public.%I
        for select
        to authenticated
        using (brand_id in (select app.user_brand_ids()))
    $p$, t, t);

    execute format('drop policy if exists "%s_brand_write" on public.%I', t, t);
    execute format($p$
      create policy "%s_brand_write" on public.%I
        for insert
        to authenticated
        with check (app.can_write_brand(brand_id)
                    and brand_id in (select app.user_brand_ids()))
    $p$, t, t);

    execute format('drop policy if exists "%s_brand_update" on public.%I', t, t);
    execute format($p$
      create policy "%s_brand_update" on public.%I
        for update
        to authenticated
        using (app.can_write_brand(brand_id))
        with check (app.can_write_brand(brand_id))
    $p$, t, t);

    execute format('drop policy if exists "%s_brand_delete" on public.%I', t, t);
    execute format($p$
      create policy "%s_brand_delete" on public.%I
        for delete
        to authenticated
        using (app.can_write_brand(brand_id))
    $p$, t, t);
  end loop;
end
$$;

-- Rules and ledger get their own wording: the programme is editable by an
-- owner only, and the ledger is readable by staff but written only through the
-- app's award/redeem actions (the append-only trigger blocks the rest).
alter table public.crm_loyalty_rules enable row level security;
alter table public.crm_loyalty_rules force row level security;

drop policy if exists crm_loyalty_rules_brand_read on public.crm_loyalty_rules;
create policy crm_loyalty_rules_brand_read on public.crm_loyalty_rules
  for select to authenticated
  using (brand_id in (select app.user_brand_ids()));

drop policy if exists crm_loyalty_rules_owner_write on public.crm_loyalty_rules;
create policy crm_loyalty_rules_owner_write on public.crm_loyalty_rules
  for all to authenticated
  using (exists (
    select 1 from public.brand_members bm
    where bm.user_id = (auth.jwt() ->> 'sub')::uuid
      and bm.brand_id = crm_loyalty_rules.brand_id
      and bm.role in ('owner', 'admin')
  ))
  with check (exists (
    select 1 from public.brand_members bm
    where bm.user_id = (auth.jwt() ->> 'sub')::uuid
      and bm.brand_id = crm_loyalty_rules.brand_id
      and bm.role in ('owner', 'admin')
  ));

alter table public.crm_loyalty_entries enable row level security;
alter table public.crm_loyalty_entries force row level security;

drop policy if exists crm_loyalty_entries_brand_read on public.crm_loyalty_entries;
create policy crm_loyalty_entries_brand_read on public.crm_loyalty_entries
  for select to authenticated
  using (brand_id in (select app.user_brand_ids()));

drop policy if exists crm_loyalty_entries_brand_append on public.crm_loyalty_entries;
create policy crm_loyalty_entries_brand_append on public.crm_loyalty_entries
  for insert to authenticated
  with check (app.can_write_brand(brand_id)
              and brand_id in (select app.user_brand_ids()));

-- An authenticated role with no policy at all is denied by RLS, which is the
-- point; service_role still bypasses it, so keep that key server-side only.
revoke all on table public.crm_interactions, public.crm_reviews,
  public.crm_complaints, public.crm_segments, public.crm_campaigns,
  public.crm_loyalty_rules, public.crm_loyalty_entries, public.crm_memberships
  from anon;

grant select, insert, update, delete on
  public.crm_interactions, public.crm_reviews, public.crm_complaints,
  public.crm_segments, public.crm_campaigns, public.crm_memberships
  to authenticated;

grant select on public.crm_loyalty_rules, public.crm_loyalty_entries
  to authenticated;

-- ----------------------------------------------------------------------------
-- 9. Views the CRM pages read
-- ----------------------------------------------------------------------------
-- The overview and the directory both need "a customer plus their numbers".
-- In the demo that rollup is computed in buildCustomerProfiles(); in Postgres
-- the same shape lives here so a report does not have to re-derive it. Balance
-- excludes rows whose expiry has passed, matching loyaltyBalance().

create or replace view app.crm_customer_rollup as
select
  c.brand_id,
  c.id                                          as customer_id,
  c.name,
  c.status,
  c.source,
  c.tags,
  c.marketing_consent,
  c.opted_out,
  c.date_of_birth,
  count(o.id) filter (where o.status = 'completed')        as orders,
  coalesce(sum(o.grand_total) filter (where o.status = 'completed'), 0) as lifetime_value,
  -- isOpenReceivable(): not cancelled/refunded, and still not fully paid.
  coalesce(sum(o.grand_total - coalesce(o.amount_paid, 0))
           filter (where o.status not in ('cancelled', 'refunded')
                      and coalesce(o.amount_paid, 0) < o.grand_total), 0) as dues,
  max(o.created_at) filter (where o.status = 'completed')  as last_order_at,
  coalesce(sum(le.points) filter (
    where le.expires_at is null or le.expires_at > now()), 0) as loyalty_points
from public.customers c
left join public.orders o on o.customer_id = c.id and o.brand_id = c.brand_id
left join public.crm_loyalty_entries le on le.customer_id = c.id and le.brand_id = c.brand_id
group by c.brand_id, c.id, c.name, c.status, c.source, c.tags,
         c.marketing_consent, c.opted_out, c.date_of_birth;

grant select on app.crm_customer_rollup to authenticated;

-- ============================================================================
-- End of CRM schema. Again: nothing in this repository connects to it.
-- ============================================================================
