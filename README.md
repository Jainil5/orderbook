# OrderBook

Multi-business order management and POS workspace for **WebsiteIn**. One app, one data model, every record scoped by `brand_id`.

## Stack

- Next.js App Router, React, TypeScript (strict)
- Supabase Auth + PostgreSQL (browser client under RLS)
- Tailwind CSS + shared `--ob-*` design tokens

## Local development (`.env.local`)

Local secrets live in **`.env.local`** — gitignored. Never commit this file.

```bash
npm install
npm run setup:env          # creates .env.local from .env.example (once)
```

Edit `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://vdrnkhtltpwrkfjnlasf.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # from Supabase dashboard

# Server-only — login until DB RPC exists (use your Auth user emails, not passwords)
BRAND_AUTH_EMAIL_MAP={"BR-1":"cafe-owner@example.com","BR-2":"furniture-owner@example.com"}
```

Run the app (`predev` checks that `.env.local` exists):

```bash
npm run dev                  # http://localhost:3000
npm run check:env            # manual env validation
```

**Demo without login:** `/demo/dashboard` works even while you finish Supabase setup.

**Railway:** set the same variables in the project environment (not in Git).

See `docs/SECURITY.md` for hardening details.

## Routes

| Route | Description |
|-------|-------------|
| `/login` | Business ID + password sign-in, demo entry |
| `/demo/*` | Read-only Brewery Cafe demo workspace |
| `/dashboard` … `/settings` | Authenticated workspace (requires Supabase session + `brand_members`) |

## Environment reference

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | Supabase project URL (`*.supabase.co` only) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser + server | Publishable key (RLS-enforced) |
| `BRAND_AUTH_EMAIL_MAP` | **Server only** | JSON map of brand code → Auth email |

Never commit secrets or use `service_role` in the browser.

See `docs/DATABASE_CONTRACT.md` for tables, RLS, and RPC expectations.

## Commands

```bash
npm run lint
npm run build                # requires public Supabase env vars
npm start
```

## Design

Visual direction documented in `docs/DESIGN.md`.

## Demo vs live

- **Explore Demo Brand** opens the **same routes** as sign-in (`/dashboard`, `/billing`, …) with Brewery Cafe (**BR-1**) sample data via a secure httpOnly session cookie.
- **Sign in** uses Supabase Auth + `brand_members` and clears the demo cookie.
- Billing is fully interactive in demo (cart + local bill confirmation); live orders use Supabase when configured.

Built by WebsiteIn.
