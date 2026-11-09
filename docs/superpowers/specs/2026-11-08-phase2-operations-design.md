# Phase 2 — Operations Modules Design

**Goal:** Replace the five "Not built yet" Manager modules with working, cross-linked operational management (Services & jobs, Appointments, Tasks, Schedules, Visits) that a brand can run its day on, in demo mode for both brands.

**Spec authority:** the attached OrderBook expansion plan (Phase 2 checklist), minus Staff (delivered in Phase 1). Program decisions recorded below bind this plan and the later Plans B (Phase 3) and C (Phases 4+5).

**Architecture:** same spine as Phase 1 Staff — pure types + merge/validation/derivation libs (Vitest, TDD) → cookie-backed demo store (fixture + override merge) → server actions (role-gated; live mode returns honest "not connected") → client components. No new Supabase queries.

## Program decisions (binding)

- **Demo-first, live SQL later.** Live Supabase is non-functional (RLS off, 0 brand_members, missing RPCs). Phase 2 ships fully working demos; live pages keep honest "not connected yet" states. Paste-ready SQL arrives in Plan B.
- **Full cross-linking now.** Operational records reference existing Customers and Staff; customer detail and Management Overview roll them up.
- **Execution order A → B → C.** Plan A = this spec. Plan B = Phase 3 metrics kernel + schema audit + unwired SQL views/indexes. Plan C = Phases 4+5 Intelligence dashboards + insights.
- **Show-all by default.** Lists show every record; filters are opt-in chips with "All" first. No tabs hiding same-kind content.
- **Mobile contract.** Verified at ~375px; interactive targets ≥44px (`ob-touch-target`); no horizontal overflow.
- **Honesty.** No fake live data, no demo wording on delivered-client surfaces; empty states say what exists and what doesn't.
- **Old cookies keep working.** Every new bucket field read with `?? []` / `?? {}`; existing prefs writers spread, never clobber.
- **Naming.** New server actions live in `src/services/manager-ops-actions.ts` — `operations-actions.ts` already exists for order operations (payments, refunds, status).

## Data model

All entities carry `id` and `brand_id`. Demo storage: brand-pack fixtures (additive) + mutable-cookie buckets `<entity>: Entity[]` (user-created) and `<entity>Overrides: Record<string, Partial<Entity> & { deleted?: boolean }>` (edits and tombstone deletes), merged by pure libs following the fixture+override merge style of `src/lib/manager/staff.ts`. A override with `deleted: true` removes the record from every list and selector.

- **Service** — `name`, `description`, `durationMinutes`, `price`, `isActive`.
- **ServiceJob** — `serviceId`, `customerId`, `staffIds: string[]`, `status: requested | scheduled | in_progress | completed`, `scheduledAt: string | null`, `notes`.
- **Appointment** — `title`, `customerId | null`, `staffIds: string[]`, `startsAt`, `endsAt`, `location`, `serviceId | null`, `status: scheduled | completed | cancelled`, `notes`.
- **FieldVisit** — `customerId`, `staffId`, `purpose`, `status: planned | checked_in | completed`, `checkInAt | null`, `checkOutAt | null`, `report | null`.
- **Shift** — `staffId`, `date` (YYYY-MM-DD), `start` (HH:mm), `end` (HH:mm), `note`.
- **Task** — `title`, `description`, `assigneeStaffId | null`, `customerId | null`, `priority: low | medium | high`, `dueAt | null`, `status: open | in_progress | done`.

Derivations (pure, unit-tested): `isTaskOverdue(task, now)`, `isOnShift(shift, now)`, `appointmentsForDay(list, day)`, status-transition guards (e.g. check-out only from checked_in; completion requires report; job advance follows the chain), validation for every form input (lengths, time ordering, end > start, known customer/staff/service ids).

## Module UI

Each `/manager/<key>` page replaces its EmptyState with a list + create/edit inline panel in the Staff manager's visual language. Forms validate in the action, return `{ok:true} | {ok:false,message}`, and wrap awaits in try/catch/finally (catch sets "Could not save. Try again.", finally clears pending).

- **Services:** catalog rows (name, duration, price, active toggle) + New service; Service Jobs board grouped by status with assign-staff and advance-status controls; job form picks customer + service + staff.
- **Appointments:** groups Today / Upcoming / Past; form: title, customer, staff multi-select, start/end, location, optional service; actions complete / cancel.
- **Tasks:** priority badge + due date, overdue highlighted; form: title, assignee, optional customer, priority, due; actions start / done / reopen.
- **Schedules:** week grid, staff rows × 7 day columns, shift chips; add/edit shift form; prev/next week; "on shift now" badge derived from current time.
- **Visits:** groups planned / checked-in / completed; check-in and check-out stamp real timestamps; completing requires report text.

## Cross-linking

- `customers/[customerId]`: new "Operations" timeline — their appointments, visits, jobs, open tasks; each row deep-links to its module page.
- Management Overview: five rollup cards — today's appointments, overdue tasks, on-shift now, active visits, open jobs. Cards link to the module.
- Pickers everywhere reuse existing customer/staff/service lists; no duplicate people records.

## Demo fixtures (additive per brand)

- **BR-1 Brewery Cafe:** coffee-tasting appointment, supplier visit, prep/cleaning tasks, barista shifts, a catering service + job.
- **BR-2 Cubig Furniture:** delivery and installation services + jobs, site visits with reports, technician shifts, follow-up tasks.
- Fixtures reference existing fixture customer/staff ids so cross-links resolve.

## Task 1 carry-in: menu realism + order-flow proof

Approved separately, lands first in this plan:
- Remove House IPA from menu, order history (rewrite BC-1041 lines to Mango Smoothie ₹270 + Peri Peri Fries ₹180, same ₹450 total), analytics category totals and top products.
- Add: Mango Smoothie ₹270, Fresh Lime Soda ₹180 (Beverages); Bombay Grilled Sandwich ₹260, Pesto Penne Pasta ₹340 (Food); Sides & Dips category — Peri Peri Fries ₹180, Cheesy Garlic Bread ₹220, Nachos & Salsa ₹260, Hummus & Pita ₹240, Garlic Aioli ₹60, Chipotle Mayo ₹70; Desserts — Chocolate Brownie ₹180, Basque Cheesecake ₹260; Seasonal Pastry moves to Desserts keeping its 50% discount.
- 12 generated photos in the existing tile style, self-hosted under `public/demo/products/` (no hotlinks).
- E2E proof: walk-in order with table tag saved; saved-customer order with FOOD50 category discount verified; walk-in saved as new customer appears in Customers.

## Parked polish batch (from Phase 1 final review)

Visibility-aware command-palette links; gate Overview staff stats when Staff hidden; `MODULE_DESCRIPTIONS` typed `Record<ManagerModuleKey, string>`; `role="alert"` on action error messages; stale-error clearing sweep; trailing-newline sweep on touched files. Demo-cookie budget strategy and shared brand-resolution helper stay deferred to Plan B/C (they grow with ops data).

## Testing

- **Unit (TDD):** every merge/validation/derivation lib; old-cookie defaults; tombstone deletes; transition guards; cross-link selectors (customer timeline, overview rollups).
- **E2E regression (isolated Playwright browser, both brands, desktop + 375px):** multiple cases per flow, not smoke only —
  1. Billing: walk-in add/edit qty/remove line, save bill; order appears in Orders with correct totals; payment recorded; dashboard totals move.
  2. Billing: saved customer + offer code; discount math checked against kernel-independent hand computation.
  3. Orders: status change on a demo order; record payment on an unpaid order.
  4. Customers: create via walk-in checkbox; edit name/phone; verify persistence after reload.
  5. Products: create and edit a product; verify it appears in Billing catalog.
  6. Staff: add, edit, availability, deactivate (Phase 1 regression).
  7. Each ops module: create → edit → transition/delete; verify lists, filters, and persistence after reload.
  8. Cross-links: customer timeline rows and Overview rollup counts match module lists.
  9. Module visibility: hide a module → nav/subnav/direct-URL redirect (Phase 1 regression).
  10. Mobile: drawer, sub-nav scroll, bill sheet, 44px targets, no overflow.
- Console must stay clean apart from the known environmental unsafe-eval CSP error.

## Plan A task order

1. Menu realism + order-flow E2E proof
2. Ops types, store buckets, merge/validation/derivation libs (TDD)
3. Services + Service Jobs
4. Appointments
5. Tasks
6. Schedules
7. Visits
8. Cross-linking: customer timeline + Overview rollups
9. Parked polish batch
10. Full verification + E2E regression matrix above

## Out of scope

Live Supabase writes/queries; SQL migrations (Plan B); Intelligence nav/dashboards/insights (Plan C); order editing beyond existing status/notes/payment operations.