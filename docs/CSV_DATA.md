# OrderBook CSV data store

The demo runs on files. Every read and every write in the app goes through
`data/*.csv`, and Supabase is switched off deployment-wide with one flag
(`OB_USE_SUPABASE`, `supabaseEnabled()` in `src/lib/env.ts`). Nothing about the
UI depends on that: the same pages, server actions and loaders would talk to
Postgres if the switch were on.

This document is the contract for that layer — what the files are, the rules
the code follows when touching them, and what changing the storage later
actually means.

## Layout

One file per table, 39 tables, checked in:

```
data/
  products.csv  orders.csv  order_items.csv  customers.csv  offers.csv
  payments.csv  refunds.csv  stock_adjustments.csv
  staff.csv  services.csv  service_jobs.csv  appointments.csv  visits.csv
  shifts.csv  tasks.csv  notes.csv  attendance.csv  leave_requests.csv
  expenses.csv  suppliers.csv  purchase_orders.csv  cash_movements.csv
  cash_sessions.csv  external_events.csv  sync_actions.csv
  leads.csv  customer_interactions.csv  customer_reviews.csv
  customer_complaints.csv  customer_segments.csv  marketing_campaigns.csv
  campaign_recipients.csv  loyalty_accounts.csv  loyalty_transactions.csv
  memberships.csv  crm_settings.csv
  brand_settings.csv  audit_log.csv  sessions.csv
```

Each file's first line is its column list and the columns are the TypeScript
entity's fields, one-to-one — a CSV row is a faithful picture of the record the
app holds in memory, which is what makes opening one in a spreadsheet a real
way to inspect or fix state.

`OB_DATA_DIR=/some/path` moves the store; the test suite uses a temp directory
so no test can write into the checked-in files.

## The modules

| File | Role |
|------|------|
| `src/lib/csv/codec.ts` | `parseCsv` / `formatCsv` — quoting, embedded commas, newlines, BOM-free output |
| `src/lib/csv/schema.ts` | `CSV_TABLES`, `TABLE_SCHEMAS` (file name + typed columns per table), `encodeRow` / `decodeRow` |
| `src/lib/csv/seed.ts` | `seedTableRows(table)` — where a table's starting rows come from |
| `src/lib/csv/store.ts` | the file I/O: `readAllRows`, `readBrandRows`, `findRow`, `upsertRow`, `patchRow`, `removeRow`, `replaceAllRows` |
| `src/lib/csv/records.ts` | brand-scoped helpers on top of the store: `listBrand`, `findBrand`, `saveBrand`, `updateBrand`, `dropBrand`, `appendAudit` |
| `src/lib/csv/source.ts` | read side for the demo loaders — a brand pack whose record arrays come from CSV |
| `src/lib/csv/session-store.ts` | `data/sessions.csv`: login rows (see below) |

Server-only throughout: `store.ts` uses `node:fs` and is imported exclusively
from server modules, loaders and server actions.

## Rules the store keeps

- **Sync reads, cached by mtime + size.** Each file is parsed once and re-read
  only when it changes on disk. Callers get shallow copies, so mutating a
  returned row cannot poison the cache for the next request.
- **Auto-seed.** Reading a table whose file is missing writes it from
  `seedTableRows` first. A fresh clone — or a fresh Railway container — needs no
  setup step. To rebuild one table from its fixtures, delete that file and
  reload any page that reads it.
- **Atomic writes.** A temp file plus `rename`, so a crash mid-write cannot
  leave a half-written table.
- **`brand_id` is the tenancy column** on every table that has one. The demo
  brands are `demo-brewery-cafe` (BR-1) and `demo-cubig-furniture` (BR-2);
  a live brand's uuid would key the same column. `records.ts` stamps `brand_id`
  from the resolved session and refuses an id belonging to another brand, so a
  guessed id from another brand resolves to `null` rather than leaking a row.
  `order_items` and `payments` are keyed by `order_id` — their brand scope
  resolves through the parent order, the same rule the Supabase path uses.
- **Column kinds decide the cell ↔ value mapping:** `str`, `strN` (blank →
  `null`), `num` (blank/invalid → `0`), `numN`, `bool`, `json`, `jsonN`.
  A blank `json` cell decodes to **`null`, not `[]`** — code reading a list
  column must narrow what it gets, and `decodeCell` never refuses a bad value.
- **Bad data degrades, it does not throw.** `parseHiddenManagerModules` turns a
  garbage cell into `[]`; the app should stay usable when someone hand-edits a
  file.

## Seeding

Most tables seed from the fixture packs (`src/lib/demo/brands/packs`,
`src/lib/demo/business/*`) for both demo brands, so the checked-in CSVs and a
freshly generated `data/` directory contain the same rows. Five tables seed
empty on purpose, because they only ever hold things the app itself creates:

| Table | Why it starts empty |
|-------|--------------------|
| `stock_adjustments` | nobody authors these in fixtures; they appear when stock is adjusted |
| `sync_actions` | same — written by a sync run |
| `refunds` | created by a refund |
| `audit_log` | created by writes |
| `sessions` | seeding one would hand every visitor of a fresh checkout a live login |

## `sessions.csv` — sign-in is a row too

Login state used to live only in the `ob_demo_workspace` cookie, which meant
"who is signed in" existed inside one browser: invisible from another device,
gone with the cookies, impossible to inspect.

Now the browser holds a 24-byte random token (32 chars, base64url) and the
answer lives in `data/sessions.csv`:

| Column | Meaning |
|--------|---------|
| `id` | `session-<epoch ms>` |
| `brand_id` | which demo brand this session is the workspace for |
| `token_hash` | SHA-256 of the token — **the token itself is never stored**, so this file cannot be used to sign in |
| `created_at` / `expires_at` | ISO timestamps; the row is live for 30 days |

- Signing in (`beginDemoSession` in `src/lib/workspace/demo-session.ts`) ends
  whatever session that browser was carrying and inserts one row per brand, so
  there is at most one live row per demo brand.
- Resolving a request hashes its token and looks for a live row. Expired rows
  are pruned from the file on read.
- Signing out deletes the row, which is what makes revocation real: a copied
  cookie stops working even if it is still in the jar. Deleting a row by hand in
  a text editor does the same thing.
- Edge middleware cannot read files, so `src/lib/supabase/middleware.ts` only
  checks the token's *shape*; `(workspace)/layout.tsx` is the authority and
  redirects to `/login` when no row resolves.

## What is deliberately not in a CSV

- **The `analytics` snapshot** on a demo brand pack stays fixture-derived
  precomputed display data, not a table.
- **OAuth access/refresh tokens** (`src/lib/integrations/vault.ts`) live in
  server process memory only. Writing a credential to a checked-in file would
  put it in Git.
- **Provider API keys** stay in the environment, as everything secret does.

## Switching the storage later

The seam is small and already double-driver in the CRM area
(`src/lib/crm/repository.ts` picks CSV or Supabase on `supabaseEnabled()`):

1. Column names in `src/lib/csv/schema.ts` match
   `supabase/migrations/0002_crm.sql` and the documented live schema 1:1, so a
   SQL-backed driver needs no rename layer.
2. Reads for the demo loaders come from `csv/source.ts`; the Supabase reads are
   commented out at the call sites in `src/services/data.ts` and come back with
   the flag.
3. Writes all go through `records.ts` / `store.ts` / `session-store.ts` —
   replacing those three with another backend (SQLite, Postgres, a JSON file
   store) leaves loaders, actions and screens untouched.
4. `data/sessions.csv` is a normal table there too; a real deployment would
   instead use Supabase Auth + `brand_members`, which is the code path the
   login screen already takes when the switch is on.

Apply `docs/SUPABASE_RLS_APPLY.sql` before pointing a deployment at Supabase —
the demo does not read Supabase either way, so RLS cannot break it.

## Testing idiom

Point `OB_DATA_DIR` at a temp directory and `vi.resetModules()` in
`beforeEach` so the module-level cache is dropped between cases; assert on the
raw bytes with `parseCsv` when the point of a test is what actually landed in
the file. `src/lib/csv/csv.test.ts`, `src/lib/csv/session-store.test.ts`,
`src/lib/workspace/prefs.test.ts` and `src/lib/demo/demo-writes.test.ts` are
the reference examples.
