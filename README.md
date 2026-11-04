# OrderBook

Multi-business order management and POS workspace for **WebsiteIn**. One app, one data model, every record scoped by `brand_id`.

## Stack

- Next.js App Router, React, TypeScript (strict)
- Supabase Auth + PostgreSQL (browser client under RLS)
- Tailwind CSS + shared `--ob-*` design tokens

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Business ID + password sign-in, demo entry |
| `/demo/*` | Read-only Brewery Cafe demo workspace |
| `/dashboard` … `/settings` | Authenticated workspace (requires Supabase session + `brand_members`) |

## Environment (Railway / local)

Copy `.env.example` to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://vdrnkhtltpwrkfjnlasf.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Server-only (login mapping until RPC exists):

```bash
BRAND_AUTH_EMAIL_MAP={"BR-1":"owner@example.com","BR-2":"owner2@example.com"}
```

Never commit secrets or use `service_role` in the browser.

See `docs/DATABASE_CONTRACT.md` for tables, RLS, and RPC expectations.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build    # requires public Supabase env vars
npm start
```

## Design

Visual direction documented in `docs/DESIGN.md`. Reference inspiration: [Curated #4425](https://curated.design/sites/s/4425/) (Primeintellect listing — adapted to calm light admin UI, not copied).

## Demo vs live

- **Demo** (`/demo/dashboard`): isolated fixtures in `src/lib/demo/fixtures.ts`, labelled DEMO, read-only.
- **Live**: Supabase queries + `create_order` RPC when provisioned. Missing schema surfaces inline errors, not fake data.

## Blockers until Supabase is ready

- `BRAND_AUTH_EMAIL_MAP` or `resolve_brand_auth_email` RPC for login
- Tables + RLS for CRUD
- `create_order` RPC for billing submission
- Analytics views/RPCs for dashboard KPIs

Built by WebsiteIn.
