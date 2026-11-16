# CRM build contract

The rules and the API surface every CRM screen and action must build against.
Written once so eight screens cannot invent eight private conventions.

If you are adding a CRM screen, read §1 (non-negotiables), §5 (actions), §6 (UI)
and copy the nearest existing section.

---

## 1. Non-negotiables

1. **Deterministic numbers only.** Every count, total, rate, average, tier and
   segment member comes from `src/lib/crm/metrics.ts` computed from real rows.
   No LLM, no rounding "estimates", no number typed into an input box and
   stored as a metric. Campaign tallies are recounted from recipient rows
   (`recountCampaign`), never trusted from the client.
2. **One customer entity.** The CRM reuses `customers`, `orders`, `payments`,
   `staff` and `offers`. It never copies money data into a CRM table and never
   creates a second customer model. A converted lead links to the customer the
   app's existing write path created.
3. **Tenancy on every read and write.** CRM rows are brand-scoped by
   `CrmRepository` (it refuses cross-brand writes). Server actions derive
   `brand_id` from the session, never from form data.
4. **Consent is a hard gate.** A campaign audience is
   `marketing_consent === "granted"` minus `opted_out_at` minus archived —
   produced only by `consentedCustomerIds()`.
5. **No fake sending.** There is no delivery, no "sent" simulation, no made-up
   open rates. A recipient is `marked_sent_at` only when a human records it,
   and the campaign card says who recorded it.
6. **Configurable loyalty.** Tiers, earn rate, redemption value, expiry live in
   `crm_settings.loyalty`. Nothing in the UI may assume 10 points = ₹1 or any
   other constant; always read `loyaltyConfigFor(settings)`.
7. **Permission checks are server-side.** `guardCrm("log" | "manage")` in the
   action. Client components may hide buttons, that is cosmetic only.
8. **Demo and live must both work.** Pages read through `loadCrmWorkspace()`
   and write through `CrmRepository`; neither branch knows which one it is on.

## 2. Layer map

```
route (src/app/(workspace)/customers/**)   server components: load, pass down
  └─ src/lib/crm/loader.ts                 one read, joined + derived
       ├─ src/lib/crm/repository.ts       CRM tables (CSV now, Supabase later)
       ├─ src/services/data.ts            customers / offers (existing readers)
       └─ src/lib/demo/data.ts            demo equivalents
  └─ src/lib/crm/metrics.ts               pure derivations (no I/O)
  └─ src/components/crm/**                presentational + client forms
  └─ src/services/crm-*-actions.ts        writes ("use server")
       └─ src/lib/crm/actions-kit.ts      guard / audit / revalidate helpers
```

Owner map (who may edit what):

| Area | Files |
| --- | --- |
| Data model | `src/types/crm.ts`, `src/types/database.ts`, `src/lib/csv/schema.ts` |
| Storage | `src/lib/crm/repository.ts`, `src/lib/csv/*` |
| Derivation | `src/lib/crm/metrics.ts` |
| Reads | `src/lib/crm/loader.ts` |
| Action plumbing | `src/lib/crm/actions-kit.ts`, `src/lib/crm/customer-fields.ts` |
| Shared UI | `src/components/crm/crm-ui.tsx`, CRM block of `src/app/globals.css` |
| Nav | `src/lib/workspace/crm-nav.ts` |
| Screens | `src/app/(workspace)/customers/**`, `src/components/crm/<section>/**` |
| Writes | `src/services/crm-<section>-actions.ts` |

### 2.1 One vocabulary, one unit

Every stored enum lives in `src/types/crm.ts` as a union **plus** its value
array and label map — `LEAD_STAGES`, `REVIEW_SENTIMENTS`, `COMPLAINT_STATUSES`,
`MEMBERSHIP_STATUSES`, `CAMPAIGN_TYPES`, `CAMPAIGN_CHANNELS`,
`CAMPAIGN_STATUSES`, `RECIPIENT_STATUSES` and the matching `*_LABELS`. Actions
validate against those arrays and screens render through `*_LABELS`, so the five
values a campaign can hold are spelled in exactly one place. A section folder
may keep the *presentational* part only — chip tones (`campaigns/campaign-options.ts`
re-exports the vocabulary and adds `CAMPAIGN_STATUS_TONES`). Consequence of the
layer map: **a file under `src/services/` must never import from
`src/components/`.**

Stored enums hold the enum value, never the label — `review_sources` in
`crm_settings` stores `"google"`, the UI shows "Google" via
`REVIEW_SOURCE_LABELS`. Lead sources are the deliberate exception: they are free
text a brand types, not an enum.

Units for anything a metric returns: counts are integers; money is in whole
brand-currency units with at most 2 decimals (`round2`); **rates and percentages
are already 0–100** — `leadConversionRate: 33.33` means 33.33%. Format with
`${Math.round(value)}%`. Multiplying by 100 again is how a screen ends up
claiming 5000% conversion.

## 3. Storage

Eleven CRM tables, all `id, brand_id, …` first, in `CSV_TABLES`
(`src/lib/csv/schema.ts`) and in `CRM_SQL_TABLES`
(`src/lib/crm/repository.ts`) which maps each to its future Postgres name:

`leads, customer_interactions, customer_reviews, customer_complaints,
customer_segments, marketing_campaigns, campaign_recipients, loyalty_accounts,
loyalty_transactions, memberships, crm_settings`

`CrmRepository` (`src/lib/crm/repository.ts`):

```ts
type CrmRepository = {
  brandId: string; brandCode: string; driver: "csv" | "supabase";
  list(table): Promise<CrmRowFor<T>[]>          // brand-filtered
  find(table, id): Promise<Row | null>          // null if another brand's row
  save(table, row): Promise<Row>                // brand-stamped; newCrmId() if no id
  patch(table, id, partial): Promise<Row | null>// merge, keeps created_at
  remove(table, id): Promise<boolean>
  removeWhere(table, predicate): Promise<number>
}
```

`getCrmRepository()` switches on `supabaseEnabled()` (`src/lib/env.ts`).
Today `OB_USE_SUPABASE` is off, so the CSV driver is live and the Supabase
driver is code-complete but dormant. `crmAsOf()` returns one ISO instant for a
request.

CSV gotcha: an empty `json` cell decodes to **`null`**, not `[]`. Always
`(row.tags ?? [])`, `(segment.rules.sourcesAny ?? [])`,
`(segment.manual_customer_ids ?? [])`.

### 3.1 Migrations and RLS

`supabase/migrations/0002_crm.sql` is those eleven tables in SQL — same column
names and nullability as `src/lib/csv/schema.ts`, CHECK constraints on every
enum, indexes on the `brand_id` + filter pairs the screens actually query, and
one `<table>_all` policy per table using the same brand-membership subquery as
`docs/SUPABASE_RLS_APPLY.sql` (`brand_id IN (SELECT bm.brand_id FROM
brand_members bm WHERE bm.user_id = auth.uid() AND coalesce(bm.is_active,
true))`). Re-runnable; nothing in the app executes it.

Its status is stated in the file and is worth repeating: **written, not
applied, not tested against a live project.** Two prerequisites are listed at
the bottom of it — timestamp normalisation in `SupabaseCrmRepository` (Postgres
returns `+00:00` forms the CSV-shaped code slices naively) and id-type
alignment before any cross-table foreign key. Until both are done, flipping
`OB_USE_SUPABASE` on is not a supported CRM deployment; the CSV driver is.

### 3.2 Demo consent fixtures

The consent gate has two branches, so the demo data must show both. The packs
(`src/lib/demo/brands/*.ts`) give every customer one of the four states on
purpose: `granted` (c1, c2, fc2, fc4 → they appear in audiences), `granted` +
`opted_out_at` (c3 → in a campaign's history, never in today's audience),
`declined` (fc3 → never contactable, no campaign rows) and `null` (fc1 →
"consent has never been recorded"). If a screen only ever shows empty
audiences, fix the fixture rather than the filter.

`data/*.csv` is generated from the packs on first read when a table file is
missing (`seedIfMissing` in `src/lib/csv/store.ts`). After editing a pack, delete
that one CSV file and reload any page — the store rewrites it with its own
encoder, so the diff stays limited to the fields you changed.

## 4. Reads — `loadCrmWorkspace()`

```ts
const crm = await loadCrmWorkspace();      // null ⇒ no session ⇒ redirect("/login")
```

`CrmWorkspace` carries: `brandId, brandCode, driver, mode, asOf, repo`,
`currencyCode, role, canLog, canManage` (so a page never needs a second
session read), the joined operational rows (`customers, orders, staff,
offers`), the eleven CRM collections (`leads, interactions, reviews,
complaints, segments, campaigns, recipients, loyaltyAccounts,
loyaltyTransactions, memberships, settings`), and the precomputed
`stats: CustomerStat[]`, `overview: CrmOverview`,
`reviewIntel: ReviewIntelligence`.

Join helpers, all in the same file — use these instead of hand-rolling:
`statById`, `customerById`, `leadById`, `staffName`, `ordersForCustomer`,
`segmentData`, `segmentMemberIds`, `segmentMembers`, `consentedCustomerIds`,
`planCampaignRecipients`, `recountCampaign`, `customerTimeline`,
`describeSegmentRules`. Pick-list defaults: `DEFAULT_LEAD_SOURCES`,
`DEFAULT_REVIEW_SOURCES`.

Pages must not call `readBrandRows`, `listCustomers` or `getCrmRepository`, and
never compute a total, average or count themselves — those come from
`crm.stats`, `crm.overview` and `crm.reviewIntel`. One page = one
`loadCrmWorkspace()`.

The exception is a *per-row label*, which is a pure function over a row the
loader already returned: `classifyReviewSentiment(review)` for a chip,
`findDuplicateCustomers(crm.customers)` for the duplicates panel. If a screen
needs such a helper, keep it a label and say so in the code; if it needs a
number, the number belongs in `loadCrmWorkspace()` instead.

## 5. Actions

File per section: `src/services/crm-<section>-actions.ts`, top line
`"use server";`. Reference implementations: `src/services/crm-review-actions.ts`
(typed input) and `src/services/crm-lead-actions.ts` (native form + redirect) —
see §5.1.

The shape, in order — never skip a step:

```ts
export async function saveThingAction(input: ThingInput): Promise<CrmActionState> {
  const guard = await guardCrm("log");                 // 1. permission
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();                 // 2. real ids to validate against
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);
  const name = text(input.name, "Name", 120);           // 3. validate (src/lib/business/validate.ts)
  if (!name.ok) return name;
  const ownerId = refId(input.owner_id, refs.staffIds, "Owner");
  if (!ownerId.ok) return ownerId;
  const id = input.id ?? newCrmId();
  const existing = await crm.repo.find("leads", id);
  const saved = existing                              // 4. write via repository
    ? await crm.repo.patch("leads", id, { ... })
    : await crm.repo.save("leads", { id, brand_id: guard.brandId, ... });
  if (!saved) return { ok: false, message: "Not found." };
  await auditCrm(guard, existing ? "crm.thing.updated" : "crm.thing.created",
                 "crm_thing", saved.id, saved.name);   // 5. audit
  revalidateCrm();                                    // 6. refresh every CRM screen
  return { ok: true };
}
```

From `src/lib/crm/actions-kit.ts`: `CRM_PATHS`, `guardCrm`, `CrmActionState`,
`crmRefs`, `CrmRefs`, `auditCrm`, `revalidateCrm(...extraPaths)`,
`optionalDate`, `crmCsv(filename, rows)`, `crmPermissionsFor(role)`.
The validators (`text, oneOf, refId, flag, money, day, instant, Validated`) are
re-exported from here as well, so a CRM action file opens with one import block.

### 5.1 Two input conventions — both are allowed

**A. Typed input (default).** `saveThingAction(input: ThingInput)` as above; the
form is a client component that awaits the action, calls `router.refresh()` and
renders `result.message` with `role="alert"`. Use it when the screen must keep
its filter chips, open row or scroll position after a write — reviews,
interactions, segments, campaigns, loyalty.

**B. Native form + redirect.** `saveThingAction(form: FormData)` built from
`field`, `requiredField` and `optionalDate`, answering with
`crmReturnTo(path, { notice | error | query })`. The screen renders
`<CrmNotice notice={sp.notice} error={sp.error} />`. Use it where the write
should work with JavaScript switched off and a full round trip is fine — the
lead board does this (`src/services/crm-lead-actions.ts`).

Either way: same guard, same validators, same repository write, same audit, and
the message names what actually happened. "Saved" is only ever shown after a
successful write; a redirect-based action that could not write says so.

Rules:
- Scope: `"log"` = record activity (lead, interaction, review reply);
  `"manage"` = segments, campaigns, loyalty config, complaints, deletions.
- Returning `{ ok: false, message }` is the only failure channel. Never throw
  at the user, never `alert`.
- Anything the client could lie about (ids, brand, counts, stages) is
  re-validated against `crmRefs`.
- Exports: build rows server-side and return `crmCsv(...)`; the UI is
  `<CsvExportButton label="Export CSV" onExport={exportThingCsvAction} />`.
- Deleting a customer is **archive** (`status = "archived"`), not `remove`.

## 6. UI

### 6.1 Shared primitives — `src/components/crm/crm-ui.tsx`

```tsx
<CrmSubnav />                                  // strip at the top of every CRM page
<CrmSectionHeader title description actions />  // h2 + one line + buttons
<CrmStatRow stats={[{ label, value, hint?, href? }]} />
<CrmPanel title meta actions className>         // card with the dark botanical rail
<CrmStageChip stage="quote_sent" label="Quote sent" />
<CrmChip tone="neutral|positive|warning|danger|ink" />
<CrmRating rating={4.5} />
<CrmKeyValue items={[{ label, value }]} />
<CrmNotice notice={sp.notice} error={sp.error} />   // the ?notice=/?error= banner, §5.1 B
<CrmReadOnlyNote role={crm.role} scope="manage">    // what a viewer sees instead of a form
  You can see every campaign and what has been recorded.
</CrmReadOnlyNote>
```

Also available: `@/components/ui/{Card,Button,Input,Badge,Tabs,EmptyState,
StatCard,SegmentedControl}`, `@/components/export/csv-export-button`,
`@/components/workspace/page-shell` (`PageShell`), `cn` from `@/lib/cn`,
lucide icons. If a primitive is missing, build it **inside your own section
folder** and tell the coordinator; do not edit `crm-ui.tsx`.

### 6.2 Page skeleton (server component)

```tsx
export default async function CrmXPage({ searchParams }: {
  searchParams: Promise<{ q?: string; stage?: string }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;
  const perms = crmPermissionsFor((await loadWorkspaceSession())!.role);
  return (
    <PageShell title="…">
      <CrmSubnav />
      <CrmSectionHeader title="…" description="…" actions={<…/>} />
      <CrmStatRow stats={…} />
      …
    </PageShell>
  );
}
```

Filters/sort/tabs and the record being edited live in `searchParams`
(shareable, back-button-correct), never in client state. Forms follow one of
the two conventions in §5.1. Pages take `crm.canLog` / `crm.canManage` from
`loadCrmWorkspace()` and either hide the write affordance or render the
read-only card that explains why it is hidden.

### 6.3 Look — "Dark Botanical / Lab Green"

The CRM is the one area with its own skin, layered on top of the app tokens.
Use the classes, not inline hex: `crm-rail`, `crm-surface`, `crm-stage` +
`crm-stage-new|progress|won|lost`, `crm-sentiment-positive|neutral|negative`,
`crm-dots`, `crm-kv`, and the variables `--crm-ink`, `--crm-ink-soft`,
`--crm-leaf`, `--crm-lab`, `--crm-lab-strong`, `--crm-wash`,
`--crm-wash-line`, `--crm-bark`, `--crm-amber`, `--crm-rust`.
Everything that is not a CRM-specific signal keeps `--ob-*` (so "danger" looks
the same as the rest of the app). No new global CSS without asking.

### 6.4 Mobile and a11y

`ob-touch-target` on anything tappable, `ob-stagger` on card grids, horizontal
scroll for wide tables (`ob-scroll-x`), `aria-current="page"` handled by
`CrmSubnav`, `role="status"`/`role="alert"` on save feedback, labels on every
input.

## 7. Permissions

| Capability | owner | admin | manager | staff |
| --- | --- | --- | --- | --- |
| Read CRM | ✓ | ✓ | ✓ | ✓ |
| Log activity (lead, follow-up, interaction, review reply) | ✓ | ✓ | ✓ | ✓ |
| Manage (segments, campaigns, loyalty, complaints, delete) | ✓ | ✓ | ✓ | — |

`canLogCrmActivity` / `canManageCrm` in `src/lib/security/authorization.ts` are
the source of truth and are rendered live at `/manager/staff/permissions`.

The demo workspace session is always `owner`
(`src/lib/workspace/session.ts`), so the read-only card in §6.2 cannot be
reached by clicking around the demo — it is proven by the action-level tests,
which mock the session role, and by a live workspace.

Three scope calls are deliberate, because they are the ones a reviewer tends to
question (all 38 CRM actions carry a `guardCrm` scope; the split is
`log` 16 / `manage` 22):

- `setMarketingConsentAction` is **`log`**. Capturing "yes, send me offers" at
  the counter is front-line work. Revoking it is the same call, and the export
  that follows consent is also `log` — the protection here is that the audience
  builder honours the stored value, not that staff are trusted with it.
- Moving points (`awardBonusPoints`, `redeemPoints`, `adjustPoints`,
  `awardOrderPoints`) and issuing/renewing memberships are **`manage`**, the
  same scope as the loyalty configuration they draw on. A staff member can log
  that a customer redeemed; a manager presses the button.
- Deleting a lead and archiving a customer are **`manage`**; deleting a segment
  additionally refuses while a campaign still points at it.

Changing any of these is a product decision, not a cleanup — say so in the
commit and in the table above.

## 8. Routes

| Route | Screen |
| --- | --- |
| `/customers` | CRM Overview |
| `/customers/directory` | Customers list (the old `/customers`) |
| `/customers/[customerId]` | 360° customer profile |
| `/customers/leads` | Pipeline (New → Site Visit → Quote Sent → Negotiating → Won/Lost) |
| `/customers/interactions` | Interaction log + follow-ups → Productivity task |
| `/customers/reviews` | Review inbox + complaints |
| `/customers/segments` | Dynamic + manual segments |
| `/customers/campaigns` | Campaigns, audiences, manually recorded outcomes |
| `/customers/loyalty` | Points, tiers, memberships, loyalty configuration |

Nav comes from `CRM_SECTIONS` (`src/lib/workspace/crm-nav.ts`); the sidebar,
the sub-nav and the ⌘K palette all derive from that one array. Adding a
section = one entry there + a route.

## 9. Verification

```bash
npx tsc --noEmit
npx eslint src
npx vitest run
npm run build
```

CRM unit tests live in `src/lib/crm/crm.test.ts` with `AS_OF` pinned
(`2026-06-15T09:00:00.000Z`) and `OB_DATA_DIR` pointed at a temp dir —
copy that idiom for any new test that touches the CSV store.

Then run the eight screens as they will actually be seen, in demo mode with
Supabase off — a page that type-checks but throws on read is not done:

```bash
npx next dev -H 0.0.0.0 -p 3000            # logs to a file, never a dead pipe
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Cookie: ob_demo_workspace=<token>" http://127.0.0.1:3000/customers
```

`<token>` is the browser's session token, not `BR-1`: opening
`/login?demo=BR-1` in a real browser appends a row to `data/sessions.csv` and
sets `ob_demo_workspace` to that row's 32-character token (the file stores only
its SHA-256, so copy the value from DevTools → Application → Cookies). A
request with anything else is bounced to `/login`.

…for `/customers`, `directory`, `leads`, `interactions`, `reviews`, `segments`,
`campaigns`, `loyalty`, plus `/customers/<id>`, one `?id=` deep link per
segment/campaign screen and one deliberately bad `?id=` (the empty state must
render, not throw). Check the numbers in the HTML against the CSVs — the point
of the module is that they are derivable.
