# Phase 2 Operations Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the five "Not built yet" Manager modules with working, cross-linked operations management (Services & jobs, Appointments, Tasks, Schedules, Visits) in demo mode for both brands, plus the approved menu-realism refresh.

**Architecture:** Same spine as Phase 1 Staff — pure types + merge/validation/derivation libs (Vitest, TDD) → cookie-backed demo store (brand-pack fixtures + mutable bucket with overrides/tombstones) → role-gated server actions (live mode returns honest "not connected") → client components in the Staff manager's visual language. No Supabase queries.

**Tech Stack:** Next.js (custom fork — see constraints), React client components, TypeScript, Vitest (node env), httpOnly cookie store, Playwright MCP isolated browser for E2E.

**Spec:** `docs/superpowers/specs/2026-11-08-phase2-operations-design.md`

**Working directory:** `/Users/jainil/Documents/development/orderbook/.worktrees/manager-foundation` (branch `feat/manager-foundation`). All paths below are relative to this worktree. All commands run from it.

## Global Constraints

- **Demo-first, live SQL later.** Live mode pages keep honest "not connected yet" states; actions return `{ ok:false, message:"Operations are not connected to live workspaces yet." }` after the role gate. No new Supabase queries.
- **Old cookies keep working.** Every new bucket field read with `?? []` / `?? {}`; writers spread the bucket, never clobber.
- **Naming.** New server actions live in `src/services/manager-ops-actions.ts` — `operations-actions.ts` already exists for order operations.
- **Show-all by default.** Lists show every record; filters are opt-in chips with "All" first.
- **Mobile contract.** Verified at ~375px; interactive targets ≥44px (`ob-touch-target`); no horizontal overflow.
- **Honesty.** No fake live data, no demo wording on delivered-client surfaces.
- **Typecheck:** `npx next typegen && npx tsc --noEmit` (typegen is REQUIRED before tsc on this Next fork). Tests: `npm test` (Vitest, `src/**/*.test.ts`).
- **Action contract:** every action returns `{ok:true} | {ok:false,message}`; client components wrap awaits in try/catch/finally (catch sets "Could not save. Try again.", finally clears pending) and clear stale errors on success.
- **Browser etiquette:** E2E uses the Playwright MCP **isolated** browser only; never touch the user's Chrome tabs; never use port 3000. Dev server for this worktree: port 3003 (already running; restart only if dead — probe first).
- **No scratch files in the repo.** Verification artifacts go to `/tmp` and get deleted. Never stage `.env.local`, `.superpowers/`, or `node_modules`.
- **AGENTS.md:** `next dev` re-adds its context block; if it appears modified, commit it with the task's work.
- **Tombstones:** an override with `deleted: true` removes the record from every list and selector.

## File Structure

| File | Responsibility |
|---|---|
| `src/types/operations.ts` (create) | Six entity types + status/priority unions |
| `src/lib/manager/ops-shared.ts` (create) | Generic tombstone-aware merge + id helper |
| `src/lib/manager/services.ts` (create) | Service/job validation, status chain |
| `src/lib/manager/appointments.ts` (create) | Appointment validation, day grouping |
| `src/lib/manager/tasks.ts` (create) | Task validation, overdue derivation |
| `src/lib/manager/schedules.ts` (create) | Shift validation, on-shift, week grid |
| `src/lib/manager/visits.ts` (create) | Visit validation, transition guards |
| `src/lib/manager/ops-selectors.ts` (create) | Customer timeline + Overview rollups |
| `src/lib/demo/mutable-store.ts` (modify) | 12 new bucket fields |
| `src/lib/demo/brands/types.ts` (modify) | 6 new pack fixture arrays |
| `src/lib/demo/brands/brewery-cafe.ts` (modify) | Menu refresh (Task 1) + ops fixtures (Task 2) |
| `src/lib/demo/brands/cubig-furniture.ts` (modify) | Ops fixtures |
| `src/lib/demo/operations-data.ts` (create) | Merged list loaders per entity |
| `src/services/manager-ops-actions.ts` (create) | All ops CRUD/transition actions |
| `src/components/manager/{services,appointments,tasks,schedules,visits}-manager.tsx` (create) | One client component per module |
| `src/components/customers/customer-operations-timeline.tsx` (create) | Cross-link timeline |
| `src/app/(workspace)/manager/{services,appointments,tasks,schedules,visits}/page.tsx` (modify) | Replace EmptyState with real pages |
| `src/app/(workspace)/manager/page.tsx` (modify) | Rollup cards + descriptions |
| `src/app/(workspace)/customers/[customerId]/page.tsx` (modify) | Timeline section |
| `src/lib/demo/product-image-urls.ts` (modify) | 12 new self-hosted image keys |

---

### Task 1: Menu realism + order-flow E2E proof

**Files:**
- Create: `src/lib/demo/brands/brewery-cafe.test.ts`, `public/demo/products/{mango-smoothie,fresh-lime-soda,bombay-grilled-sandwich,pesto-penne-pasta,peri-peri-fries,cheesy-garlic-bread,nachos-salsa,hummus-pita,garlic-aioli,chipotle-mayo,chocolate-brownie,basque-cheesecake}.jpg`
- Modify: `src/lib/demo/product-image-urls.ts`, `src/lib/demo/brands/brewery-cafe.ts`

**Interfaces:**
- Consumes: existing `DEMO_CAFE_IMAGES`, `BREWERY_CAFE_DEMO`, `Product`/`OrderItem` types.
- Produces: product ids `p14`–`p25` (used by Task 2 fixture cross-checks only); `DEMO_CAFE_IMAGES` keys `mangoSmoothie, limeSoda, bombaySandwich, pestoPasta, periPeriFries, garlicBread, nachos, hummusPita, garlicAioli, chipotleMayo, brownie, cheesecake`.

- [ ] **Step 1: Write the failing fixture test**

Create `src/lib/demo/brands/brewery-cafe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { BREWERY_CAFE_DEMO } from "./brewery-cafe";

describe("Brewery Cafe menu realism", () => {
  it("has no House IPA in products or order snapshots", () => {
    expect(BREWERY_CAFE_DEMO.products.some((p) => p.name === "House IPA")).toBe(false);
    expect(
      BREWERY_CAFE_DEMO.orderItems.some((i) => i.product_name_snapshot === "House IPA"),
    ).toBe(false);
    expect(
      BREWERY_CAFE_DEMO.analytics.topProducts.some((p) => p.name === "House IPA"),
    ).toBe(false);
  });

  it("rewrites BC-1041 to Mango Smoothie + Peri Peri Fries summing to the subtotal", () => {
    const order = BREWERY_CAFE_DEMO.orders.find((o) => o.order_number === "BC-1041");
    expect(order).toBeDefined();
    const lines = BREWERY_CAFE_DEMO.orderItems.filter((i) => i.order_id === order!.id);
    expect(lines.map((l) => l.product_name_snapshot).sort()).toEqual([
      "Mango Smoothie",
      "Peri Peri Fries",
    ]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(order!.subtotal);
  });

  it("has six Sides & Dips and three Desserts, all with self-hosted photos", () => {
    const sides = BREWERY_CAFE_DEMO.products.filter((p) => p.category === "Sides & Dips");
    const desserts = BREWERY_CAFE_DEMO.products.filter((p) => p.category === "Desserts");
    expect(sides).toHaveLength(6);
    expect(desserts).toHaveLength(3);
    for (const p of [...sides, ...desserts]) {
      expect(p.image_url?.startsWith("/demo/products/")).toBe(true);
    }
  });

  it("keeps Seasonal Pastry's 50% discount after moving it to Desserts", () => {
    const pastry = BREWERY_CAFE_DEMO.products.find((p) => p.name === "Seasonal Pastry");
    expect(pastry?.category).toBe("Desserts");
    expect(pastry?.default_discount_percent).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/demo/brands/brewery-cafe.test.ts`
Expected: FAIL (House IPA present; BC-1041 lines wrong; categories missing).

- [ ] **Step 3: Generate the 12 photos**

Use the ImageGen tool, size `1024x768`, one image per item. Style prompt prefix for ALL of them (matches existing tiles): "Overhead editorial cafe food photograph, warm natural window light, wooden table, shallow depth of field, believable independent-cafe menu photo, no text, no watermark. Subject: ". Subjects: mango smoothie in a glass; fresh lime soda with mint; bombay grilled sandwich with chutney; pesto penne pasta in a bowl; peri peri fries with dusting; cheesy garlic bread slices; nachos with salsa; hummus with pita triangles; small bowl of garlic aioli dip; small bowl of chipotle mayo dip; chocolate brownie square; basque cheesecake slice. Save each result into `public/demo/products/` with the exact filenames listed in Files (copy from the ImageGen output path; verify each file exists and is >10KB).

- [ ] **Step 4: Add image keys**

In `src/lib/demo/product-image-urls.ts`, add inside `DEMO_CAFE_IMAGES` (before the closing `} as const;`):

```ts
  mangoSmoothie: "/demo/products/mango-smoothie.jpg",
  limeSoda: "/demo/products/fresh-lime-soda.jpg",
  bombaySandwich: "/demo/products/bombay-grilled-sandwich.jpg",
  pestoPasta: "/demo/products/pesto-penne-pasta.jpg",
  periPeriFries: "/demo/products/peri-peri-fries.jpg",
  garlicBread: "/demo/products/cheesy-garlic-bread.jpg",
  nachos: "/demo/products/nachos-salsa.jpg",
  hummusPita: "/demo/products/hummus-pita.jpg",
  garlicAioli: "/demo/products/garlic-aioli.jpg",
  chipotleMayo: "/demo/products/chipotle-mayo.jpg",
  brownie: "/demo/products/chocolate-brownie.jpg",
  cheesecake: "/demo/products/basque-cheesecake.jpg",
```

- [ ] **Step 5: Edit the brand pack**

In `src/lib/demo/brands/brewery-cafe.ts`:

1. Delete the entire `p5` House IPA product object.
2. Change `p6` Seasonal Pastry: `category: null` → `category: "Desserts"` (keep `default_discount_percent: 50`).
3. Append after `p13` (before the `products` array closes) these 12 products, all `brand_id: "demo-brewery-cafe"`, `is_active: true`:

```ts
    { id: "p14", brand_id: "demo-brewery-cafe", name: "Mango Smoothie", description: "Alphonso pulp, yogurt, a little honey", sku: "BV-BV-002", category: "Beverages", price: 270, cost_price: 80, unit: "glass", is_active: true, image_url: DEMO_CAFE_IMAGES.mangoSmoothie },
    { id: "p15", brand_id: "demo-brewery-cafe", name: "Fresh Lime Soda", description: "Sweet, salted or mixed — your call", sku: "BV-BV-003", category: "Beverages", price: 180, cost_price: 40, unit: "glass", is_active: true, image_url: DEMO_CAFE_IMAGES.limeSoda },
    { id: "p16", brand_id: "demo-brewery-cafe", name: "Bombay Grilled Sandwich", description: "Chutney, cheese, masala toast", sku: "BV-FD-003", category: "Food", price: 260, cost_price: 85, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.bombaySandwich },
    { id: "p17", brand_id: "demo-brewery-cafe", name: "Pesto Penne Pasta", description: "Basil pesto, parmesan, cherry tomatoes", sku: "BV-FD-004", category: "Food", price: 340, cost_price: 110, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.pestoPasta },
    { id: "p18", brand_id: "demo-brewery-cafe", name: "Peri Peri Fries", description: "Crisp fries, peri peri dust", sku: "BV-SD-001", category: "Sides & Dips", price: 180, cost_price: 50, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.periPeriFries },
    { id: "p19", brand_id: "demo-brewery-cafe", name: "Cheesy Garlic Bread", description: "Toasted, herbed, pull-apart", sku: "BV-SD-002", category: "Sides & Dips", price: 220, cost_price: 65, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.garlicBread },
    { id: "p20", brand_id: "demo-brewery-cafe", name: "Nachos & Salsa", description: "Warm tortilla chips, house salsa", sku: "BV-SD-003", category: "Sides & Dips", price: 260, cost_price: 75, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.nachos },
    { id: "p21", brand_id: "demo-brewery-cafe", name: "Hummus & Pita", description: "Olive oil, za'atar, warm pita", sku: "BV-SD-004", category: "Sides & Dips", price: 240, cost_price: 70, unit: "plate", is_active: true, image_url: DEMO_CAFE_IMAGES.hummusPita },
    { id: "p22", brand_id: "demo-brewery-cafe", name: "Garlic Aioli", description: "House dip for the fries", sku: "BV-SD-005", category: "Sides & Dips", price: 60, cost_price: 15, unit: "dip", is_active: true, image_url: DEMO_CAFE_IMAGES.garlicAioli },
    { id: "p23", brand_id: "demo-brewery-cafe", name: "Chipotle Mayo", description: "Smoky heat, small bowl", sku: "BV-SD-006", category: "Sides & Dips", price: 70, cost_price: 18, unit: "dip", is_active: true, image_url: DEMO_CAFE_IMAGES.chipotleMayo },
    { id: "p24", brand_id: "demo-brewery-cafe", name: "Chocolate Brownie", description: "Fudgy centre, served warm", sku: "BV-DS-001", category: "Desserts", price: 180, cost_price: 50, unit: "piece", is_active: true, image_url: DEMO_CAFE_IMAGES.brownie },
    { id: "p25", brand_id: "demo-brewery-cafe", name: "Basque Cheesecake", description: "Burnt top, molten middle", sku: "BV-DS-002", category: "Desserts", price: 260, cost_price: 85, unit: "slice", is_active: true, image_url: DEMO_CAFE_IMAGES.cheesecake },
```

4. Replace order item `oi3` (the House IPA line) with two lines:

```ts
    { id: "oi3", order_id: "o2", product_id: "p14", product_name_snapshot: "Mango Smoothie", quantity: 1, unit_price: 270, line_discount: 0, line_total: 270 },
    { id: "oi4", order_id: "o2", product_id: "p18", product_name_snapshot: "Peri Peri Fries", quantity: 1, unit_price: 180, line_discount: 0, line_total: 180 },
```

Order `o2` itself stays unchanged (subtotal 450, tax 22.5, grand total 472.5 — the new lines still sum to 450).

5. In `analytics`: replace `salesByCategory` with:

```ts
    salesByCategory: [
      { category: "Coffee", total: 360 },
      { category: "Food", total: 252 },
      { category: "Beverages", total: 270 },
      { category: "Sides & Dips", total: 180 },
    ],
```

and in `topProducts` replace `{ name: "House IPA", qty: 18 }` with `{ name: "Mango Smoothie", qty: 18 }`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test && npx next typegen && npx tsc --noEmit`
Expected: all tests PASS (including the 4 new ones), tsc clean.

- [ ] **Step 7: Order-flow E2E proof (Playwright MCP isolated browser)**

Server: probe `curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/billing` — expect 200. If dead, start `npm run dev -- --port 3003` in background from the worktree and wait for ready. Use ONLY `mcp__plugin_playwright_playwright__*` tools (isolated browser; never chrome-devtools on the user's Chrome). If the Next dev overlay blocks clicks, remove `nextjs-portal` via `browser_evaluate` first. The known unsafe-eval CSP console error is environmental — ignore only that one.

Cases (snapshot the page to find current control labels; do not guess selectors):
1. **Walk-in order:** navigate `http://localhost:3003/billing`. Add Flat White ×2 and Peri Peri Fries ×1 via the tiles/cart. Set notes/table tag "Table 7". Save the bill. Verify the order appears at `/orders` with subtotal 220×2+180=620, tax 5% = 31, grand total 651 (verify against what the UI computes; the kernel applies tax per brand settings — assert UI totals are internally consistent: subtotal − discount + tax = grand total). Record a payment on it; verify payment status flips to paid.
2. **Saved customer + FOOD50:** new bill, pick customer "Ananya Mehta", add Avocado Toast ×2 (Food, 320×2=640), apply offer code `FOOD50` (50% off Food, max ₹150 → discount must be exactly 150, not 320). Verify grand total = 640 − 150 + 5% of 490 (=24.5) = 514.5. Save; verify in Orders.
3. **Walk-in saved as customer:** new bill with any item, use the save-as-new-customer control (name "Test Walkin", phone "+91 90000 99999"); save; verify "Test Walkin" appears at `/customers`.
4. Reload `/orders` and `/customers` — created records persist (cookie-backed).
5. Resize to 375×812 (`browser_resize`), repeat a quick add-to-cart + save on `/billing`: no horizontal overflow, qty/save controls ≥44px.

Write evidence (case → observed values) to `/tmp/phase2-task1-e2e.md`, delete it after summarizing into the commit message body/report. If a case fails, fix the underlying bug with a failing test first (TDD) before re-running.

- [ ] **Step 8: Commit**

```bash
git add src/lib/demo/brands/brewery-cafe.ts src/lib/demo/brands/brewery-cafe.test.ts src/lib/demo/product-image-urls.ts public/demo/products/
git commit -m "feat: realistic Brewery Cafe menu with sides, dips and desserts"
```

---

### Task 2: Ops types, store buckets, libs, fixtures, data loaders (TDD)

**Files:**
- Create: `src/types/operations.ts`, `src/lib/manager/ops-shared.ts` + `.test.ts`, `src/lib/manager/services.ts` + `.test.ts`, `src/lib/manager/appointments.ts` + `.test.ts`, `src/lib/manager/tasks.ts` + `.test.ts`, `src/lib/manager/schedules.ts` + `.test.ts`, `src/lib/manager/visits.ts` + `.test.ts`, `src/lib/manager/ops-selectors.ts` + `.test.ts`, `src/lib/demo/operations-data.ts`
- Modify: `src/lib/demo/mutable-store.ts`, `src/lib/demo/brands/types.ts`, `src/lib/demo/brands/brewery-cafe.ts`, `src/lib/demo/brands/cubig-furniture.ts`

**Interfaces:**
- Consumes: `DemoMutableBucket`, `readDemoMutableBucket`, `getDemoBrandPack`, `DemoBrandCode`, `StaffMember`.
- Produces (later tasks rely on ALL of these exact names):
  - Types: `Service`, `ServiceJob`, `ServiceJobStatus`, `Appointment`, `AppointmentStatus`, `FieldVisit`, `FieldVisitStatus`, `Shift`, `Task`, `TaskPriority`, `TaskStatus` from `@/types/operations`.
  - `OpsOverride<T>`, `mergeOpsEntities<T>(base, additions, overrides): T[]`, `newOpsId(prefix): string` from `@/lib/manager/ops-shared`.
  - `validateServiceInput`, `validateServiceJobInput`, `nextJobStatus`, `jobAdvanceError`, `SERVICE_JOB_STATUSES`, `SERVICE_JOB_STATUS_LABELS` from `@/lib/manager/services`.
  - `validateAppointmentInput`, `appointmentsForDay`, `groupAppointments`, `APPOINTMENT_STATUS_LABELS` from `@/lib/manager/appointments`.
  - `validateTaskInput`, `isTaskOverdue`, `TASK_PRIORITIES`, `TASK_PRIORITY_LABELS`, `TASK_STATUS_LABELS` from `@/lib/manager/tasks`.
  - `validateShiftInput`, `isOnShift`, `weekDays` from `@/lib/manager/schedules`.
  - `validateVisitInput`, `visitTransitionError`, `VISIT_STATUS_LABELS` from `@/lib/manager/visits`.
  - `customerOperationsTimeline`, `overviewRollups`, `OpsTimelineRow` from `@/lib/manager/ops-selectors`.
  - `listDemoServices`, `listDemoServiceJobs`, `listDemoAppointments`, `listDemoTasks`, `listDemoShifts`, `listDemoVisits`, `loadDemoOperations` from `@/lib/demo/operations-data`.
  - Bucket keys: lists `services, serviceJobs, appointments, tasks, shifts, visits`; overrides `serviceOverrides, serviceJobOverrides, appointmentOverrides, taskOverrides, shiftOverrides, visitOverrides`.
  - Pack fixture arrays: `services, serviceJobs, appointments, visits, shifts, tasks` on `DemoBrandPack`.

- [ ] **Step 1: Write failing tests for the shared merge**

Create `src/lib/manager/ops-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mergeOpsEntities } from "./ops-shared";

type Row = { id: string; name: string };

describe("mergeOpsEntities", () => {
  const base: Row[] = [{ id: "b1", name: "Fixture" }];
  const added: Row[] = [{ id: "a1", name: "Created" }];

  it("merges base and additions", () => {
    expect(mergeOpsEntities(base, added, {})).toHaveLength(2);
  });

  it("applies overrides without mutating inputs", () => {
    const merged = mergeOpsEntities(base, [], { b1: { name: "Renamed" } });
    expect(merged[0].name).toBe("Renamed");
    expect(base[0].name).toBe("Fixture");
  });

  it("tombstones remove fixture and created records", () => {
    expect(mergeOpsEntities(base, added, { b1: { deleted: true }, a1: { deleted: true } })).toEqual([]);
  });

  it("does not leak the deleted flag onto surviving records", () => {
    const merged = mergeOpsEntities(base, [], { b1: { name: "X", deleted: false } });
    expect(merged[0]).toEqual({ id: "b1", name: "X" });
  });

  it("additions win over base on id collision", () => {
    const merged = mergeOpsEntities(base, [{ id: "b1", name: "New" }], {});
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("New");
  });
});
```

Run: `npm test -- src/lib/manager/ops-shared.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Implement types + shared merge**

Create `src/types/operations.ts`:

```ts
export type Service = {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
};

export type ServiceJobStatus = "requested" | "scheduled" | "in_progress" | "completed";

export type ServiceJob = {
  id: string;
  brand_id: string;
  serviceId: string;
  customerId: string;
  staffIds: string[];
  status: ServiceJobStatus;
  scheduledAt: string | null;
  notes: string;
};

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  brand_id: string;
  title: string;
  customerId: string | null;
  staffIds: string[];
  startsAt: string;
  endsAt: string;
  location: string;
  serviceId: string | null;
  status: AppointmentStatus;
  notes: string;
};

export type FieldVisitStatus = "planned" | "checked_in" | "completed";

export type FieldVisit = {
  id: string;
  brand_id: string;
  customerId: string;
  staffId: string;
  purpose: string;
  status: FieldVisitStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  report: string | null;
};

export type Shift = {
  id: string;
  brand_id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  note: string;
};

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "in_progress" | "done";

export type Task = {
  id: string;
  brand_id: string;
  title: string;
  description: string;
  assigneeStaffId: string | null;
  customerId: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  status: TaskStatus;
};
```

Create `src/lib/manager/ops-shared.ts`:

```ts
export type OpsOverride<T> = Partial<T> & { deleted?: boolean };

export function mergeOpsEntities<T extends { id: string }>(
  base: readonly T[],
  additions: readonly T[],
  overrides: Record<string, OpsOverride<T>>,
): T[] {
  const byId = new Map<string, T>();
  for (const entity of [...base, ...additions]) {
    const { deleted: _deleted, ...patch } = overrides[entity.id] ?? {};
    byId.set(entity.id, { ...entity, ...patch });
  }
  return Array.from(byId.values()).filter((e) => !overrides[e.id]?.deleted);
}

export function newOpsId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
```

Run: `npm test -- src/lib/manager/ops-shared.test.ts` — Expected: PASS (5 tests).

- [ ] **Step 3: Services lib — failing tests**

Create `src/lib/manager/services.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jobAdvanceError, nextJobStatus, validateServiceInput, validateServiceJobInput } from "./services";
import type { ServiceJob } from "@/types/operations";

describe("validateServiceInput", () => {
  it("accepts a valid service and rounds price", () => {
    const r = validateServiceInput({ name: " Delivery ", description: " x ", durationMinutes: "60", price: "499.999" });
    expect(r).toEqual({ ok: true, value: { name: "Delivery", description: "x", durationMinutes: 60, price: 500 } });
  });
  it("rejects empty name", () => {
    expect(validateServiceInput({ name: " ", durationMinutes: "60", price: "10" }).ok).toBe(false);
  });
  it("rejects out-of-range duration", () => {
    expect(validateServiceInput({ name: "A", durationMinutes: "2", price: "10" }).ok).toBe(false);
    expect(validateServiceInput({ name: "A", durationMinutes: "500", price: "10" }).ok).toBe(false);
  });
  it("rejects negative price", () => {
    expect(validateServiceInput({ name: "A", durationMinutes: "60", price: "-1" }).ok).toBe(false);
  });
});

describe("job status chain", () => {
  it("advances requested → scheduled → in_progress → completed → null", () => {
    expect(nextJobStatus("requested")).toBe("scheduled");
    expect(nextJobStatus("scheduled")).toBe("in_progress");
    expect(nextJobStatus("in_progress")).toBe("completed");
    expect(nextJobStatus("completed")).toBeNull();
  });
  const job: ServiceJob = { id: "j", brand_id: "b", serviceId: "s", customerId: "c", staffIds: [], status: "requested", scheduledAt: null, notes: "" };
  it("blocks scheduling without staff and time", () => {
    expect(jobAdvanceError(job)).not.toBeNull();
    expect(jobAdvanceError({ ...job, staffIds: ["st1"], scheduledAt: "2026-11-09T10:00:00.000Z" })).toBeNull();
  });
  it("blocks advancing a completed job", () => {
    expect(jobAdvanceError({ ...job, status: "completed" })).not.toBeNull();
  });
});

describe("validateServiceJobInput", () => {
  const known = { serviceIds: ["s1"], customerIds: ["c1"], staffIds: ["st1"] };
  it("accepts known ids and optional empty staff", () => {
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "c1", staffIds: [] }, known).ok).toBe(true);
  });
  it("rejects unknown service, customer or staff", () => {
    expect(validateServiceJobInput({ serviceId: "no", customerId: "c1", staffIds: [] }, known).ok).toBe(false);
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "no", staffIds: [] }, known).ok).toBe(false);
    expect(validateServiceJobInput({ serviceId: "s1", customerId: "c1", staffIds: ["no"] }, known).ok).toBe(false);
  });
});
```

Run: `npm test -- src/lib/manager/services.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement services lib**

Create `src/lib/manager/services.ts`:

```ts
import type { ServiceJob, ServiceJobStatus } from "@/types/operations";

export const SERVICE_JOB_STATUSES: ServiceJobStatus[] = [
  "requested",
  "scheduled",
  "in_progress",
  "completed",
];

export const SERVICE_JOB_STATUS_LABELS: Record<ServiceJobStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export type ServiceInput = {
  name: string;
  description?: string;
  durationMinutes: string;
  price: string;
};

export function validateServiceInput(
  input: ServiceInput,
):
  | { ok: true; value: { name: string; description: string; durationMinutes: number; price: number } }
  | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "Name is required." };
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    return { ok: false, message: "Duration must be 5–480 minutes." };
  }
  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) {
    return { ok: false, message: "Enter a valid price." };
  }
  return {
    ok: true,
    value: {
      name,
      description: (input.description ?? "").trim().slice(0, 300),
      durationMinutes,
      price: Math.round(price * 100) / 100,
    },
  };
}

export function nextJobStatus(status: ServiceJobStatus): ServiceJobStatus | null {
  const i = SERVICE_JOB_STATUSES.indexOf(status);
  return i >= 0 && i < SERVICE_JOB_STATUSES.length - 1 ? SERVICE_JOB_STATUSES[i + 1] : null;
}

export function jobAdvanceError(job: ServiceJob): string | null {
  const next = nextJobStatus(job.status);
  if (!next) return "Job is already completed.";
  if (next === "scheduled" && (job.staffIds.length === 0 || !job.scheduledAt)) {
    return "Assign staff and a schedule before scheduling a job.";
  }
  return null;
}

export type ServiceJobInput = {
  serviceId: string;
  customerId: string;
  staffIds: string[];
  scheduledAt?: string;
  notes?: string;
};

export function validateServiceJobInput(
  input: ServiceJobInput,
  known: { serviceIds: string[]; customerIds: string[]; staffIds: string[] },
):
  | { ok: true; value: { serviceId: string; customerId: string; staffIds: string[]; scheduledAt: string | null; notes: string } }
  | { ok: false; message: string } {
  if (!known.serviceIds.includes(input.serviceId)) return { ok: false, message: "Pick a valid service." };
  if (!known.customerIds.includes(input.customerId)) return { ok: false, message: "Pick a valid customer." };
  if (input.staffIds.some((id) => !known.staffIds.includes(id))) {
    return { ok: false, message: "Pick valid staff members." };
  }
  let scheduledAt: string | null = null;
  if (input.scheduledAt) {
    const t = new Date(input.scheduledAt);
    if (Number.isNaN(t.getTime())) return { ok: false, message: "Enter a valid schedule time." };
    scheduledAt = t.toISOString();
  }
  return {
    ok: true,
    value: {
      serviceId: input.serviceId,
      customerId: input.customerId,
      staffIds: input.staffIds,
      scheduledAt,
      notes: (input.notes ?? "").trim().slice(0, 300),
    },
  };
}
```

Run: `npm test -- src/lib/manager/services.test.ts` — Expected: PASS.

- [ ] **Step 5: Appointments lib — failing tests**

Create `src/lib/manager/appointments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { appointmentsForDay, groupAppointments, validateAppointmentInput } from "./appointments";
import type { Appointment } from "@/types/operations";

const known = { customerIds: ["c1"], staffIds: ["st1"], serviceIds: ["s1"] };
const valid = { title: "Tasting", customerId: "c1", staffIds: ["st1"], startsAt: "2026-11-08T10:00", endsAt: "2026-11-08T11:00", location: "Cafe", serviceId: "", notes: "" };

describe("validateAppointmentInput", () => {
  it("normalizes times to ISO and empty refs to null", () => {
    const r = validateAppointmentInput(valid, known);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.serviceId).toBeNull();
      expect(new Date(r.value.startsAt).toISOString()).toBe(r.value.startsAt);
    }
  });
  it("rejects end before start", () => {
    expect(validateAppointmentInput({ ...valid, endsAt: "2026-11-08T09:00" }, known).ok).toBe(false);
  });
  it("rejects empty title and unknown refs", () => {
    expect(validateAppointmentInput({ ...valid, title: " " }, known).ok).toBe(false);
    expect(validateAppointmentInput({ ...valid, customerId: "no" }, known).ok).toBe(false);
    expect(validateAppointmentInput({ ...valid, staffIds: ["no"] }, known).ok).toBe(false);
  });
});

function apt(id: string, startsAt: string): Appointment {
  return { id, brand_id: "b", title: id, customerId: null, staffIds: [], startsAt, endsAt: startsAt, location: "", serviceId: null, status: "scheduled", notes: "" };
}

describe("day helpers", () => {
  const list = [apt("p", "2026-11-07T10:00:00.000Z"), apt("t2", "2026-11-08T15:00:00.000Z"), apt("t1", "2026-11-08T09:00:00.000Z"), apt("u", "2026-11-09T10:00:00.000Z")];
  it("appointmentsForDay filters and sorts by start", () => {
    expect(appointmentsForDay(list, "2026-11-08").map((a) => a.id)).toEqual(["t1", "t2"]);
  });
  it("groupAppointments splits past/today/upcoming", () => {
    const g = groupAppointments(list, new Date("2026-11-08T12:00:00.000Z"));
    expect(g.past.map((a) => a.id)).toEqual(["p"]);
    expect(g.today.map((a) => a.id)).toEqual(["t1", "t2"]);
    expect(g.upcoming.map((a) => a.id)).toEqual(["u"]);
  });
});
```

Run: `npm test -- src/lib/manager/appointments.test.ts` — Expected: FAIL.

- [ ] **Step 6: Implement appointments lib**

Create `src/lib/manager/appointments.ts`:

```ts
import type { Appointment, AppointmentStatus } from "@/types/operations";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type AppointmentInput = {
  title: string;
  customerId?: string;
  staffIds: string[];
  startsAt: string;
  endsAt: string;
  location?: string;
  serviceId?: string;
  notes?: string;
};

export function validateAppointmentInput(
  input: AppointmentInput,
  known: { customerIds: string[]; staffIds: string[]; serviceIds: string[] },
):
  | { ok: true; value: { title: string; customerId: string | null; staffIds: string[]; startsAt: string; endsAt: string; location: string; serviceId: string | null; notes: string } }
  | { ok: false; message: string } {
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false, message: "Title is required." };
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Enter valid start and end times." };
  }
  if (end.getTime() <= start.getTime()) return { ok: false, message: "End must be after start." };
  const customerId = input.customerId?.trim() || null;
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a valid customer." };
  }
  if (input.staffIds.some((id) => !known.staffIds.includes(id))) {
    return { ok: false, message: "Pick valid staff members." };
  }
  const serviceId = input.serviceId?.trim() || null;
  if (serviceId && !known.serviceIds.includes(serviceId)) {
    return { ok: false, message: "Pick a valid service." };
  }
  return {
    ok: true,
    value: {
      title,
      customerId,
      staffIds: input.staffIds,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: (input.location ?? "").trim().slice(0, 160),
      serviceId,
      notes: (input.notes ?? "").trim().slice(0, 300),
    },
  };
}

export function appointmentsForDay(list: Appointment[], day: string): Appointment[] {
  return list
    .filter((a) => a.startsAt.slice(0, 10) === day)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function groupAppointments(
  list: Appointment[],
  now: Date,
): { today: Appointment[]; upcoming: Appointment[]; past: Appointment[] } {
  const today = now.toISOString().slice(0, 10);
  const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    today: sorted.filter((a) => a.startsAt.slice(0, 10) === today),
    upcoming: sorted.filter((a) => a.startsAt.slice(0, 10) > today),
    past: sorted.filter((a) => a.startsAt.slice(0, 10) < today),
  };
}
```

Run: `npm test -- src/lib/manager/appointments.test.ts` — Expected: PASS.

- [ ] **Step 7: Tasks lib — failing tests**

Create `src/lib/manager/tasks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isTaskOverdue, validateTaskInput } from "./tasks";
import type { Task } from "@/types/operations";

const known = { staffIds: ["st1"], customerIds: ["c1"] };

describe("validateTaskInput", () => {
  it("accepts a minimal task", () => {
    const r = validateTaskInput({ title: "Call supplier", priority: "high" }, known);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ title: "Call supplier", priority: "high", assigneeStaffId: null, customerId: null, dueAt: null });
  });
  it("rejects empty title and bad priority", () => {
    expect(validateTaskInput({ title: " ", priority: "high" }, known).ok).toBe(false);
    expect(validateTaskInput({ title: "A", priority: "urgent" }, known).ok).toBe(false);
  });
  it("rejects unknown assignee or customer", () => {
    expect(validateTaskInput({ title: "A", priority: "low", assigneeStaffId: "no" }, known).ok).toBe(false);
    expect(validateTaskInput({ title: "A", priority: "low", customerId: "no" }, known).ok).toBe(false);
  });
});

describe("isTaskOverdue", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const task: Task = { id: "t", brand_id: "b", title: "T", description: "", assigneeStaffId: null, customerId: null, priority: "medium", dueAt: "2026-11-07T12:00:00.000Z", status: "open" };
  it("flags past-due open tasks", () => expect(isTaskOverdue(task, now)).toBe(true));
  it("ignores done tasks", () => expect(isTaskOverdue({ ...task, status: "done" }, now)).toBe(false));
  it("ignores tasks without due date", () => expect(isTaskOverdue({ ...task, dueAt: null }, now)).toBe(false));
  it("ignores future due dates", () => expect(isTaskOverdue({ ...task, dueAt: "2026-11-09T12:00:00.000Z" }, now)).toBe(false));
});
```

Run: `npm test -- src/lib/manager/tasks.test.ts` — Expected: FAIL.

- [ ] **Step 8: Implement tasks lib**

Create `src/lib/manager/tasks.ts`:

```ts
import type { Task, TaskPriority, TaskStatus } from "@/types/operations";

export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high"];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export type TaskInput = {
  title: string;
  description?: string;
  assigneeStaffId?: string;
  customerId?: string;
  priority: string;
  dueAt?: string;
};

export function validateTaskInput(
  input: TaskInput,
  known: { staffIds: string[]; customerIds: string[] },
):
  | { ok: true; value: { title: string; description: string; assigneeStaffId: string | null; customerId: string | null; priority: TaskPriority; dueAt: string | null } }
  | { ok: false; message: string } {
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false, message: "Title is required." };
  if (!TASK_PRIORITIES.includes(input.priority as TaskPriority)) {
    return { ok: false, message: "Pick a valid priority." };
  }
  const assigneeStaffId = input.assigneeStaffId?.trim() || null;
  if (assigneeStaffId && !known.staffIds.includes(assigneeStaffId)) {
    return { ok: false, message: "Pick a valid assignee." };
  }
  const customerId = input.customerId?.trim() || null;
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a valid customer." };
  }
  let dueAt: string | null = null;
  if (input.dueAt) {
    const t = new Date(input.dueAt);
    if (Number.isNaN(t.getTime())) return { ok: false, message: "Enter a valid due date." };
    dueAt = t.toISOString();
  }
  return {
    ok: true,
    value: {
      title,
      description: (input.description ?? "").trim().slice(0, 500),
      assigneeStaffId,
      customerId,
      priority: input.priority as TaskPriority,
      dueAt,
    },
  };
}

export function isTaskOverdue(task: Task, now: Date): boolean {
  return task.status !== "done" && task.dueAt !== null && new Date(task.dueAt).getTime() < now.getTime();
}
```

Run: `npm test -- src/lib/manager/tasks.test.ts` — Expected: PASS.

- [ ] **Step 9: Schedules lib — failing tests**

Create `src/lib/manager/schedules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isOnShift, validateShiftInput, weekDays } from "./schedules";
import type { Shift } from "@/types/operations";

describe("validateShiftInput", () => {
  const valid = { staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };
  it("accepts a valid shift", () => {
    expect(validateShiftInput(valid, ["st1"]).ok).toBe(true);
  });
  it("rejects unknown staff, bad date, bad time, end before start", () => {
    expect(validateShiftInput({ ...valid, staffId: "no" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, date: "2026-13-40" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, start: "25:00" }, ["st1"]).ok).toBe(false);
    expect(validateShiftInput({ ...valid, end: "08:00" }, ["st1"]).ok).toBe(false);
  });
});

describe("isOnShift", () => {
  const shift: Shift = { id: "s", brand_id: "b", staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };
  it("true inside the window", () => expect(isOnShift(shift, new Date("2026-11-08T12:00:00.000Z"))).toBe(true));
  it("false at end boundary", () => expect(isOnShift(shift, new Date("2026-11-08T17:00:00.000Z"))).toBe(false));
  it("false on another day", () => expect(isOnShift(shift, new Date("2026-11-09T12:00:00.000Z"))).toBe(false));
});

describe("weekDays", () => {
  it("returns Monday-first week containing the anchor", () => {
    expect(weekDays(new Date("2026-11-08T12:00:00.000Z"))).toEqual([
      "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
  });
  it("handles Monday anchor", () => {
    expect(weekDays(new Date("2026-11-02T00:00:00.000Z"))[0]).toBe("2026-11-02");
  });
});
```

Run: `npm test -- src/lib/manager/schedules.test.ts` — Expected: FAIL.

- [ ] **Step 10: Implement schedules lib**

Create `src/lib/manager/schedules.ts`:

```ts
import type { Shift } from "@/types/operations";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ShiftInput = {
  staffId: string;
  date: string;
  start: string;
  end: string;
  note?: string;
};

export function validateShiftInput(
  input: ShiftInput,
  staffIds: string[],
):
  | { ok: true; value: { staffId: string; date: string; start: string; end: string; note: string } }
  | { ok: false; message: string } {
  if (!staffIds.includes(input.staffId)) return { ok: false, message: "Pick a valid staff member." };
  if (!DATE_RE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    return { ok: false, message: "Enter a valid date." };
  }
  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end)) {
    return { ok: false, message: "Enter valid times (HH:mm)." };
  }
  if (input.end <= input.start) return { ok: false, message: "End must be after start." };
  return {
    ok: true,
    value: {
      staffId: input.staffId,
      date: input.date,
      start: input.start,
      end: input.end,
      note: (input.note ?? "").trim().slice(0, 120),
    },
  };
}

export function isOnShift(shift: Shift, now: Date): boolean {
  const iso = now.toISOString();
  if (shift.date !== iso.slice(0, 10)) return false;
  const hm = iso.slice(11, 16);
  return shift.start <= hm && hm < shift.end;
}

export function weekDays(anchor: Date): string[] {
  const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}
```

Note: `Date.parse("2026-13-40")` is NaN, and the regex alone would pass shape-only dates like `2026-02-30` — `Date.parse` normalizes those (returns a March date), which is acceptable for a demo scheduler; the regex + parse combo is the contract the tests assert.

Run: `npm test -- src/lib/manager/schedules.test.ts` — Expected: PASS.

- [ ] **Step 11: Visits lib — failing tests**

Create `src/lib/manager/visits.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateVisitInput, visitTransitionError } from "./visits";
import type { FieldVisit } from "@/types/operations";

describe("validateVisitInput", () => {
  const known = { customerIds: ["c1"], staffIds: ["st1"] };
  it("accepts known customer and staff", () => {
    expect(validateVisitInput({ customerId: "c1", staffId: "st1", purpose: "Site survey" }, known).ok).toBe(true);
  });
  it("rejects empty purpose and unknown ids", () => {
    expect(validateVisitInput({ customerId: "c1", staffId: "st1", purpose: " " }, known).ok).toBe(false);
    expect(validateVisitInput({ customerId: "no", staffId: "st1", purpose: "X" }, known).ok).toBe(false);
    expect(validateVisitInput({ customerId: "c1", staffId: "no", purpose: "X" }, known).ok).toBe(false);
  });
});

describe("visitTransitionError", () => {
  const visit: FieldVisit = { id: "v", brand_id: "b", customerId: "c1", staffId: "st1", purpose: "Survey", status: "planned", checkInAt: null, checkOutAt: null, report: null };
  it("allows check-in only from planned", () => {
    expect(visitTransitionError(visit, "check_in")).toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_in")).not.toBeNull();
  });
  it("requires checked_in status and a report for check-out", () => {
    expect(visitTransitionError(visit, "check_out", "done")).not.toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_out", " ")).not.toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_out", "Delivered unit")).toBeNull();
  });
});
```

Run: `npm test -- src/lib/manager/visits.test.ts` — Expected: FAIL.

- [ ] **Step 12: Implement visits lib**

Create `src/lib/manager/visits.ts`:

```ts
import type { FieldVisit, FieldVisitStatus } from "@/types/operations";

export const VISIT_STATUS_LABELS: Record<FieldVisitStatus, string> = {
  planned: "Planned",
  checked_in: "Checked in",
  completed: "Completed",
};

export type VisitInput = { customerId: string; staffId: string; purpose: string };

export function validateVisitInput(
  input: VisitInput,
  known: { customerIds: string[]; staffIds: string[] },
):
  | { ok: true; value: { customerId: string; staffId: string; purpose: string } }
  | { ok: false; message: string } {
  if (!known.customerIds.includes(input.customerId)) return { ok: false, message: "Pick a valid customer." };
  if (!known.staffIds.includes(input.staffId)) return { ok: false, message: "Pick a valid staff member." };
  const purpose = input.purpose.trim().slice(0, 200);
  if (!purpose) return { ok: false, message: "Purpose is required." };
  return { ok: true, value: { customerId: input.customerId, staffId: input.staffId, purpose } };
}

export function visitTransitionError(
  visit: FieldVisit,
  action: "check_in" | "check_out",
  report?: string,
): string | null {
  if (action === "check_in") {
    return visit.status === "planned" ? null : "Only planned visits can be checked in.";
  }
  if (visit.status !== "checked_in") return "Only checked-in visits can be checked out.";
  if (!report?.trim()) return "Add a visit report before completing.";
  return null;
}
```

Run: `npm test -- src/lib/manager/visits.test.ts` — Expected: PASS.

- [ ] **Step 13: Selectors — failing tests**

Create `src/lib/manager/ops-selectors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { customerOperationsTimeline, overviewRollups } from "./ops-selectors";
import type { Appointment, FieldVisit, ServiceJob, Shift, Task } from "@/types/operations";

const now = new Date("2026-11-08T12:00:00.000Z");
const apt: Appointment = { id: "a1", brand_id: "b", title: "Tasting", customerId: "c1", staffIds: [], startsAt: "2026-11-08T15:00:00.000Z", endsAt: "2026-11-08T16:00:00.000Z", location: "", serviceId: null, status: "scheduled", notes: "" };
const visit: FieldVisit = { id: "v1", brand_id: "b", customerId: "c1", staffId: "st1", purpose: "Survey", status: "checked_in", checkInAt: "2026-11-08T10:00:00.000Z", checkOutAt: null, report: null };
const job: ServiceJob = { id: "j1", brand_id: "b", serviceId: "s1", customerId: "c1", staffIds: ["st1"], status: "requested", scheduledAt: null, notes: "" };
const task: Task = { id: "t1", brand_id: "b", title: "Follow up", description: "", assigneeStaffId: null, customerId: "c1", priority: "high", dueAt: "2026-11-07T12:00:00.000Z", status: "open" };
const shift: Shift = { id: "s1", brand_id: "b", staffId: "st1", date: "2026-11-08", start: "09:00", end: "17:00", note: "" };

describe("customerOperationsTimeline", () => {
  it("collects the customer's records with deep links, newest first, undated last", () => {
    const rows = customerOperationsTimeline("c1", { appointments: [apt], visits: [visit], jobs: [job], tasks: [task] }, { s1: "Catering" });
    expect(rows.map((r) => r.kind)).toEqual(["appointment", "visit", "task", "job"]);
    expect(rows[0].href).toBe("/manager/appointments");
    expect(rows[3].title).toBe("Catering");
  });
  it("excludes other customers and done tasks", () => {
    const rows = customerOperationsTimeline("c2", { appointments: [apt], visits: [visit], jobs: [job], tasks: [task] }, {});
    expect(rows).toEqual([]);
    const rows2 = customerOperationsTimeline("c1", { appointments: [], visits: [], jobs: [], tasks: [{ ...task, status: "done" }] }, {});
    expect(rows2).toEqual([]);
  });
});

describe("overviewRollups", () => {
  it("counts today's scheduled appointments, overdue tasks, on-shift, active visits, open jobs", () => {
    const r = overviewRollups({ appointments: [apt, { ...apt, id: "a2", status: "cancelled" }], tasks: [task, { ...task, id: "t2", status: "done" }], shifts: [shift], visits: [visit], jobs: [job, { ...job, id: "j2", status: "completed" }] }, now);
    expect(r).toEqual({ todayAppointments: 1, overdueTasks: 1, onShiftNow: 1, activeVisits: 1, openJobs: 1 });
  });
});
```

Run: `npm test -- src/lib/manager/ops-selectors.test.ts` — Expected: FAIL.

- [ ] **Step 14: Implement selectors**

Create `src/lib/manager/ops-selectors.ts`:

```ts
import type { Appointment, FieldVisit, ServiceJob, Shift, Task } from "@/types/operations";
import { appointmentsForDay } from "./appointments";
import { isOnShift } from "./schedules";
import { isTaskOverdue } from "./tasks";

export type OpsTimelineRow = {
  kind: "appointment" | "visit" | "job" | "task";
  id: string;
  title: string;
  when: string | null;
  status: string;
  href: string;
};

export function customerOperationsTimeline(
  customerId: string,
  data: { appointments: Appointment[]; visits: FieldVisit[]; jobs: ServiceJob[]; tasks: Task[] },
  serviceNames: Record<string, string>,
): OpsTimelineRow[] {
  const rows: OpsTimelineRow[] = [];
  for (const a of data.appointments) {
    if (a.customerId === customerId) {
      rows.push({ kind: "appointment", id: a.id, title: a.title, when: a.startsAt, status: a.status, href: "/manager/appointments" });
    }
  }
  for (const v of data.visits) {
    if (v.customerId === customerId) {
      rows.push({ kind: "visit", id: v.id, title: v.purpose, when: v.checkInAt, status: v.status, href: "/manager/visits" });
    }
  }
  for (const t of data.tasks) {
    if (t.customerId === customerId && t.status !== "done") {
      rows.push({ kind: "task", id: t.id, title: t.title, when: t.dueAt, status: t.status, href: "/manager/tasks" });
    }
  }
  for (const j of data.jobs) {
    if (j.customerId === customerId) {
      rows.push({ kind: "job", id: j.id, title: serviceNames[j.serviceId] ?? "Service job", when: j.scheduledAt, status: j.status, href: "/manager/services" });
    }
  }
  return rows.sort((a, b) => {
    if (a.when === null && b.when === null) return 0;
    if (a.when === null) return 1;
    if (b.when === null) return -1;
    return b.when.localeCompare(a.when);
  });
}

export function overviewRollups(
  data: { appointments: Appointment[]; tasks: Task[]; shifts: Shift[]; visits: FieldVisit[]; jobs: ServiceJob[] },
  now: Date,
): { todayAppointments: number; overdueTasks: number; onShiftNow: number; activeVisits: number; openJobs: number } {
  const today = now.toISOString().slice(0, 10);
  return {
    todayAppointments: appointmentsForDay(data.appointments, today).filter((a) => a.status === "scheduled").length,
    overdueTasks: data.tasks.filter((t) => isTaskOverdue(t, now)).length,
    onShiftNow: data.shifts.filter((s) => isOnShift(s, now)).length,
    activeVisits: data.visits.filter((v) => v.status === "checked_in").length,
    openJobs: data.jobs.filter((j) => j.status !== "completed").length,
  };
}
```

Run: `npm test -- src/lib/manager/ops-selectors.test.ts` — Expected: PASS.

- [ ] **Step 15: Extend the mutable store bucket**

In `src/lib/demo/mutable-store.ts`: add the import `import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";` and extend `DemoMutableBucket` (after `staffOverrides`):

```ts
  services: Service[];
  serviceOverrides: Record<string, Partial<Service> & { deleted?: boolean }>;
  serviceJobs: ServiceJob[];
  serviceJobOverrides: Record<string, Partial<ServiceJob> & { deleted?: boolean }>;
  appointments: Appointment[];
  appointmentOverrides: Record<string, Partial<Appointment> & { deleted?: boolean }>;
  tasks: Task[];
  taskOverrides: Record<string, Partial<Task> & { deleted?: boolean }>;
  shifts: Shift[];
  shiftOverrides: Record<string, Partial<Shift> & { deleted?: boolean }>;
  visits: FieldVisit[];
  visitOverrides: Record<string, Partial<FieldVisit> & { deleted?: boolean }>;
```

Add the same 12 keys to `emptyBucket()` (`[]` for lists, `{}` for overrides). Old cookies lack these keys — every reader below uses `?? []` / `?? {}`.

- [ ] **Step 16: Extend the brand pack type + add fixtures**

In `src/lib/demo/brands/types.ts`: import the six types and add to `DemoBrandPack` (after `staff`):

```ts
  services: Service[];
  serviceJobs: ServiceJob[];
  appointments: Appointment[];
  visits: FieldVisit[];
  shifts: Shift[];
  tasks: Task[];
```

In `src/lib/demo/brands/brewery-cafe.ts`, add near the top (after imports):

```ts
const opsToday = new Date().toISOString().slice(0, 10);
const tastingStart = new Date();
tastingStart.setHours(16, 0, 0, 0);
const tastingEnd = new Date();
tastingEnd.setHours(17, 0, 0, 0);
```

and add these arrays to the pack object (after `staff`):

```ts
  services: [
    { id: "bc-svc-1", brand_id: "demo-brewery-cafe", name: "Catering Coffee Bar", description: "Pop-up espresso bar for events", durationMinutes: 120, price: 5000, isActive: true },
  ],
  serviceJobs: [
    { id: "bc-job-1", brand_id: "demo-brewery-cafe", serviceId: "bc-svc-1", customerId: "c2", staffIds: ["bc-staff-1", "bc-staff-2"], status: "scheduled", scheduledAt: new Date(Date.now() + 2 * 86400000).toISOString(), notes: "Corporate tasting for 20 guests" },
  ],
  appointments: [
    { id: "bc-apt-1", brand_id: "demo-brewery-cafe", title: "Coffee tasting — Ananya", customerId: "c2", staffIds: ["bc-staff-1"], startsAt: tastingStart.toISOString(), endsAt: tastingEnd.toISOString(), location: "Cafe counter", serviceId: null, status: "scheduled", notes: "Single-origin flight" },
  ],
  visits: [
    { id: "bc-visit-1", brand_id: "demo-brewery-cafe", customerId: "c3", staffId: "bc-staff-1", purpose: "Supplier meeting — next roast lot", status: "planned", checkInAt: null, checkOutAt: null, report: null },
  ],
  shifts: [
    { id: "bc-shift-1", brand_id: "demo-brewery-cafe", staffId: "bc-staff-2", date: opsToday, start: "08:00", end: "16:00", note: "Bar" },
    { id: "bc-shift-2", brand_id: "demo-brewery-cafe", staffId: "bc-staff-3", date: opsToday, start: "10:00", end: "18:00", note: "Kitchen" },
  ],
  tasks: [
    { id: "bc-task-1", brand_id: "demo-brewery-cafe", title: "Restock oat milk", description: "Check fridge count before evening rush", assigneeStaffId: "bc-staff-3", customerId: null, priority: "high", dueAt: new Date(Date.now() - 86400000).toISOString(), status: "open" },
    { id: "bc-task-2", brand_id: "demo-brewery-cafe", title: "Deep clean espresso machine", description: "", assigneeStaffId: "bc-staff-2", customerId: null, priority: "medium", dueAt: new Date(Date.now() + 86400000).toISOString(), status: "open" },
  ],
```

In `src/lib/demo/brands/cubig-furniture.ts`, add the same `opsToday` helper and these arrays (after `staff`; customer ids `fc2`/`fc4`, staff ids `cf-staff-*` are the existing fixtures):

```ts
  services: [
    { id: "cf-svc-1", brand_id: "demo-cubig-furniture", name: "Furniture Delivery", description: "Doorstep delivery and placement", durationMinutes: 90, price: 1500, isActive: true },
    { id: "cf-svc-2", brand_id: "demo-cubig-furniture", name: "Installation & Assembly", description: "On-site assembly by technician", durationMinutes: 120, price: 2500, isActive: true },
  ],
  serviceJobs: [
    { id: "cf-job-1", brand_id: "demo-cubig-furniture", serviceId: "cf-svc-2", customerId: "fc2", staffIds: ["cf-staff-2"], status: "in_progress", scheduledAt: new Date(Date.now() - 3600000).toISOString(), notes: "Luna sofa + wardrobe, 3rd floor" },
    { id: "cf-job-2", brand_id: "demo-cubig-furniture", serviceId: "cf-svc-1", customerId: "fc4", staffIds: [], status: "requested", scheduledAt: null, notes: "Oslo dining table delivery" },
  ],
  appointments: [
    { id: "cf-apt-1", brand_id: "demo-cubig-furniture", title: "Showroom walkthrough — Priya Homes", customerId: "fc2", staffIds: ["cf-staff-4"], startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 86400000 + 3600000).toISOString(), location: "Cubig showroom", serviceId: null, status: "scheduled", notes: "Office fit-out shortlist" },
  ],
  visits: [
    { id: "cf-visit-1", brand_id: "demo-cubig-furniture", customerId: "fc2", staffId: "cf-staff-2", purpose: "Site measurement — living room", status: "completed", checkInAt: new Date(Date.now() - 2 * 86400000).toISOString(), checkOutAt: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString(), report: "Room 4.2m x 5.1m. Sofa fits along east wall; lift access confirmed." },
    { id: "cf-visit-2", brand_id: "demo-cubig-furniture", customerId: "fc4", staffId: "cf-staff-3", purpose: "Delivery site check", status: "planned", checkInAt: null, checkOutAt: null, report: null },
  ],
  shifts: [
    { id: "cf-shift-1", brand_id: "demo-cubig-furniture", staffId: "cf-staff-2", date: opsToday, start: "09:00", end: "18:00", note: "Field installs" },
    { id: "cf-shift-2", brand_id: "demo-cubig-furniture", staffId: "cf-staff-3", date: opsToday, start: "09:00", end: "18:00", note: "Delivery van" },
  ],
  tasks: [
    { id: "cf-task-1", brand_id: "demo-cubig-furniture", title: "Send sofa care guide to Priya Homes", description: "", assigneeStaffId: "cf-staff-4", customerId: "fc2", priority: "medium", dueAt: new Date(Date.now() + 86400000).toISOString(), status: "open" },
    { id: "cf-task-2", brand_id: "demo-cubig-furniture", title: "Confirm lift booking for Shah delivery", description: "Tower B, service lift", assigneeStaffId: "cf-staff-1", customerId: "fc4", priority: "high", dueAt: new Date(Date.now() - 86400000).toISOString(), status: "open" },
  ],
```

- [ ] **Step 17: Data loaders**

Create `src/lib/demo/operations-data.ts`:

```ts
import { getDemoBrandPack } from "@/lib/demo/brands";
import { readDemoMutableBucket, type DemoMutableBucket } from "@/lib/demo/mutable-store";
import { mergeOpsEntities } from "@/lib/manager/ops-shared";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";

export type DemoOperations = {
  services: Service[];
  serviceJobs: ServiceJob[];
  appointments: Appointment[];
  tasks: Task[];
  shifts: Shift[];
  visits: FieldVisit[];
};

export function mergeOperations(pack: ReturnType<typeof getDemoBrandPack>, bucket: DemoMutableBucket): DemoOperations {
  return {
    services: mergeOpsEntities(pack.services, bucket.services ?? [], bucket.serviceOverrides ?? {}),
    serviceJobs: mergeOpsEntities(pack.serviceJobs, bucket.serviceJobs ?? [], bucket.serviceJobOverrides ?? {}),
    appointments: mergeOpsEntities(pack.appointments, bucket.appointments ?? [], bucket.appointmentOverrides ?? {}),
    tasks: mergeOpsEntities(pack.tasks, bucket.tasks ?? [], bucket.taskOverrides ?? {}),
    shifts: mergeOpsEntities(pack.shifts, bucket.shifts ?? [], bucket.shiftOverrides ?? {}),
    visits: mergeOpsEntities(pack.visits, bucket.visits ?? [], bucket.visitOverrides ?? {}),
  };
}

export async function loadDemoOperations(brandCode?: DemoBrandCode): Promise<DemoOperations> {
  const code = brandCode ?? "BR-1";
  return mergeOperations(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

export async function listDemoServices(brandCode?: DemoBrandCode): Promise<Service[]> {
  return (await loadDemoOperations(brandCode)).services;
}
export async function listDemoServiceJobs(brandCode?: DemoBrandCode): Promise<ServiceJob[]> {
  return (await loadDemoOperations(brandCode)).serviceJobs;
}
export async function listDemoAppointments(brandCode?: DemoBrandCode): Promise<Appointment[]> {
  return (await loadDemoOperations(brandCode)).appointments;
}
export async function listDemoTasks(brandCode?: DemoBrandCode): Promise<Task[]> {
  return (await loadDemoOperations(brandCode)).tasks;
}
export async function listDemoShifts(brandCode?: DemoBrandCode): Promise<Shift[]> {
  return (await loadDemoOperations(brandCode)).shifts;
}
export async function listDemoVisits(brandCode?: DemoBrandCode): Promise<FieldVisit[]> {
  return (await loadDemoOperations(brandCode)).visits;
}
```

- [ ] **Step 18: Old-cookie + fixture regression test**

Create `src/lib/demo/operations-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./brands";
import { mergeOperations } from "./operations-data";
import type { DemoMutableBucket } from "./mutable-store";

describe("mergeOperations", () => {
  it("tolerates an old cookie bucket with no ops keys", () => {
    const pack = getDemoBrandPack("BR-1");
    const oldBucket = { customers: [], offers: [], payments: [], orderPatches: {}, productOverrides: {}, auditLog: [], stockAdjustments: [], refunds: [], staff: [], staffOverrides: {} } as unknown as DemoMutableBucket;
    const ops = mergeOperations(pack, oldBucket);
    expect(ops.services.length).toBeGreaterThan(0);
    expect(ops.appointments.length).toBeGreaterThan(0);
    expect(ops.tasks.length).toBeGreaterThan(0);
  });

  it("fixture cross-links resolve for both brands", () => {
    for (const code of ["BR-1", "BR-2"] as const) {
      const pack = getDemoBrandPack(code);
      const customerIds = new Set(pack.customers.map((c) => c.id));
      const staffIds = new Set(pack.staff.map((s) => s.id));
      const serviceIds = new Set(pack.services.map((s) => s.id));
      for (const j of pack.serviceJobs) {
        expect(serviceIds.has(j.serviceId)).toBe(true);
        expect(customerIds.has(j.customerId)).toBe(true);
        for (const id of j.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const a of pack.appointments) {
        if (a.customerId) expect(customerIds.has(a.customerId)).toBe(true);
        for (const id of a.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const v of pack.visits) {
        expect(customerIds.has(v.customerId)).toBe(true);
        expect(staffIds.has(v.staffId)).toBe(true);
      }
      for (const s of pack.shifts) expect(staffIds.has(s.staffId)).toBe(true);
      for (const t of pack.tasks) {
        if (t.assigneeStaffId) expect(staffIds.has(t.assigneeStaffId)).toBe(true);
        if (t.customerId) expect(customerIds.has(t.customerId)).toBe(true);
      }
    }
  });

  it("applies tombstones from overrides", () => {
    const pack = getDemoBrandPack("BR-1");
    const bucket = { taskOverrides: { "bc-task-1": { deleted: true } } } as unknown as DemoMutableBucket;
    expect(mergeOperations(pack, bucket).tasks.some((t) => t.id === "bc-task-1")).toBe(false);
  });
});
```

- [ ] **Step 19: Full verification + commit**

Run: `npm test && npx next typegen && npx tsc --noEmit`
Expected: all PASS, tsc clean.

```bash
git add src/types/operations.ts src/lib/manager/ src/lib/demo/mutable-store.ts src/lib/demo/operations-data.ts src/lib/demo/operations-data.test.ts src/lib/demo/brands/
git commit -m "feat: operations types, tombstone merge, validation libs and demo fixtures"
```

---

### Task 3: Services + Service Jobs (actions file + UI + page)

**Files:**
- Create: `src/services/manager-ops-actions.ts`, `src/components/manager/services-manager.tsx`
- Modify: `src/app/(workspace)/manager/services/page.tsx`

**Interfaces:**
- Consumes: Task 2 libs (`validateServiceInput`, `validateServiceJobInput`, `jobAdvanceError`, `nextJobStatus`, `SERVICE_JOB_STATUSES`, `SERVICE_JOB_STATUS_LABELS`, `newOpsId`, `mergeOperations`), `loadDemoOperations`, `listDemoStaff`, `mergeDemoCustomers`, `readDemoMutableBucket`, `updateDemoMutableBucket`, `appendDemoAudit`, `loadLiveWorkspace`, `canEditBrandSettings`.
- Produces: shared action helpers `guardOps`, `knownIds`, `appendOps`, `patchOps`, `revalidateOps`, `auditOps` (Tasks 4–7 append to this file and reuse them); actions `saveServiceAction(id: string | null, input: ServiceInput)`, `deleteServiceAction(id)`, `toggleServiceActiveAction(id, isActive: boolean)`, `saveServiceJobAction(id: string | null, input: ServiceJobInput)`, `advanceServiceJobAction(id)`, `deleteServiceJobAction(id)`; component `ServicesManager({ services, jobs, customers, staff, canEdit })` where `customers`/`staff` are `{ id: string; name: string }[]`.

- [ ] **Step 1: Create the actions file with shared helpers + service/job actions**

Create `src/services/manager-ops-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import {
  appendDemoAudit,
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { newOpsId } from "@/lib/manager/ops-shared";
import {
  jobAdvanceError,
  nextJobStatus,
  validateServiceInput,
  validateServiceJobInput,
  type ServiceInput,
  type ServiceJobInput,
} from "@/lib/manager/services";
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Service, ServiceJob } from "@/types/operations";

const LIVE_UNAVAILABLE = {
  ok: false as const,
  message: "Operations are not connected to live workspaces yet.",
};

type OpsGuard =
  | { ok: true; code: DemoBrandCode; brandId: string }
  | { ok: false; message: string };

async function guardOps(): Promise<OpsGuard> {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ?? "BR-1";
  return { ok: true, code, brandId: getDemoBrandPack(code).brand.id };
}

async function knownIds(code: DemoBrandCode) {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const ops = mergeOperations(pack, bucket);
  const staff = await listDemoStaff(code);
  return {
    customerIds: mergeDemoCustomers(pack.customers, bucket).map((c) => c.id),
    staffIds: staff.map((s) => s.id),
    serviceIds: ops.services.map((s) => s.id),
  };
}

type OpsListKey = "services" | "serviceJobs" | "appointments" | "tasks" | "shifts" | "visits";
type OpsOverrideKey =
  | "serviceOverrides"
  | "serviceJobOverrides"
  | "appointmentOverrides"
  | "taskOverrides"
  | "shiftOverrides"
  | "visitOverrides";

async function appendOps(code: DemoBrandCode, key: OpsListKey, entity: { id: string }) {
  await updateDemoMutableBucket(
    code,
    (bucket) =>
      ({
        ...bucket,
        [key]: [...((bucket[key] ?? []) as { id: string }[]), entity],
      }) as DemoMutableBucket,
  );
}

async function patchOps(
  code: DemoBrandCode,
  key: OpsOverrideKey,
  id: string,
  patch: Record<string, unknown>,
) {
  await updateDemoMutableBucket(code, (bucket) => {
    const overrides = (bucket[key] ?? {}) as Record<string, Record<string, unknown>>;
    return {
      ...bucket,
      [key]: { ...overrides, [id]: { ...(overrides[id] ?? {}), ...patch } },
    } as DemoMutableBucket;
  });
}

function revalidateOps(modulePath: string) {
  revalidatePath("/manager");
  revalidatePath(modulePath);
  revalidatePath("/customers", "layout");
}

async function auditOps(
  guard: { code: DemoBrandCode; brandId: string },
  action: string,
  entityType: string,
  entityId: string,
  detail: string,
) {
  await appendDemoAudit(guard.code, {
    brand_id: guard.brandId,
    actor_email: null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
}

export async function saveServiceAction(id: string | null, input: ServiceInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceInput(input);
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "serviceOverrides", id, parsed.value);
  } else {
    const service: Service = {
      id: newOpsId("svc"),
      brand_id: guard.brandId,
      ...parsed.value,
      isActive: true,
    };
    await appendOps(guard.code, "services", service);
    await auditOps(guard, "service.created", "service", service.id, service.name);
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "serviceOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function toggleServiceActiveAction(id: string, isActive: boolean) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "serviceOverrides", id, { isActive });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function saveServiceJobAction(id: string | null, input: ServiceJobInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateServiceJobInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "serviceJobOverrides", id, parsed.value);
  } else {
    const job: ServiceJob = {
      id: newOpsId("job"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "requested",
    };
    await appendOps(guard.code, "serviceJobs", job);
    await auditOps(guard, "service_job.created", "service_job", job.id, job.notes || job.serviceId);
  }
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function advanceServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const pack = getDemoBrandPack(guard.code);
  const ops = mergeOperations(pack, await readDemoMutableBucket(guard.code));
  const job = ops.serviceJobs.find((j) => j.id === id);
  if (!job) return { ok: false as const, message: "Job not found." };
  const error = jobAdvanceError(job);
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "serviceJobOverrides", id, { status: nextJobStatus(job.status) });
  revalidateOps("/manager/services");
  return { ok: true as const };
}

export async function deleteServiceJobAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "serviceJobOverrides", id, { deleted: true });
  revalidateOps("/manager/services");
  return { ok: true as const };
}
```

- [ ] **Step 2: Build the Services manager component**

Create `src/components/manager/services-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  SERVICE_JOB_STATUSES,
  SERVICE_JOB_STATUS_LABELS,
  nextJobStatus,
} from "@/lib/manager/services";
import {
  advanceServiceJobAction,
  deleteServiceAction,
  deleteServiceJobAction,
  saveServiceAction,
  saveServiceJobAction,
  toggleServiceActiveAction,
} from "@/services/manager-ops-actions";
import type { Service, ServiceJob } from "@/types/operations";

type Person = { id: string; name: string };

// datetime-local inputs need LOCAL time; stored timestamps are ISO/UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ServicesManager({
  services,
  jobs,
  customers,
  staff,
  canEdit,
}: {
  services: Service[];
  jobs: ServiceJob[];
  customers: Person[];
  staff: Person[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcDescription, setSvcDescription] = useState("");
  const [svcDuration, setSvcDuration] = useState("60");
  const [svcPrice, setSvcPrice] = useState("");

  const [editingJob, setEditingJob] = useState<ServiceJob | null>(null);
  const [jobService, setJobService] = useState("");
  const [jobCustomer, setJobCustomer] = useState("");
  const [jobStaff, setJobStaff] = useState<string[]>([]);
  const [jobWhen, setJobWhen] = useState("");
  const [jobNotes, setJobNotes] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startServiceEdit(service: Service | null) {
    setEditingService(service);
    setSvcName(service?.name ?? "");
    setSvcDescription(service?.description ?? "");
    setSvcDuration(String(service?.durationMinutes ?? 60));
    setSvcPrice(service ? String(service.price) : "");
    setError(null);
  }

  function startJobEdit(job: ServiceJob | null) {
    setEditingJob(job);
    setJobService(job?.serviceId ?? services[0]?.id ?? "");
    setJobCustomer(job?.customerId ?? customers[0]?.id ?? "");
    setJobStaff(job?.staffIds ?? []);
    setJobWhen(job?.scheduledAt ? toLocalInput(job.scheduledAt) : "");
    setJobNotes(job?.notes ?? "");
    setError(null);
  }

  const nameOf = (list: Person[], id: string) => list.find((p) => p.id === id)?.name ?? "Unknown";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        <Card className="p-4">
          <h2 className="font-semibold">{editingService ? `Edit ${editingService.name}` : "New service"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveServiceAction(editingService?.id ?? null, {
                  name: svcName,
                  description: svcDescription,
                  durationMinutes: svcDuration,
                  price: svcPrice,
                }),
              );
              if (ok) startServiceEdit(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input className="ob-input mt-1 w-full" value={svcName} onChange={(e) => setSvcName(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Description (optional)</span>
              <input className="ob-input mt-1 w-full" value={svcDescription} onChange={(e) => setSvcDescription(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Duration (min)</span>
                <input className="ob-input mt-1 w-full" type="number" min={5} max={480} value={svcDuration} onChange={(e) => setSvcDuration(e.target.value)} required disabled={!canEdit || pending} />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Price</span>
                <input className="ob-input mt-1 w-full" type="number" min={0} step="0.01" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} required disabled={!canEdit || pending} />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
                {pending ? "Saving…" : editingService ? "Save changes" : "Add service"}
              </button>
              {editingService ? (
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startServiceEdit(null)}>Cancel</button>
              ) : null}
            </div>
          </form>
        </Card>
        <Card className="p-4">
          <h2 className="font-semibold">{editingJob ? "Edit job" : "New service job"}</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveServiceJobAction(editingJob?.id ?? null, {
                  serviceId: jobService,
                  customerId: jobCustomer,
                  staffIds: jobStaff,
                  scheduledAt: jobWhen || undefined,
                  notes: jobNotes,
                }),
              );
              if (ok) startJobEdit(null);
            }}
          >
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Service</span>
              <select className="ob-input mt-1 w-full" value={jobService} onChange={(e) => setJobService(e.target.value)} disabled={!canEdit || pending}>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer</span>
              <select className="ob-input mt-1 w-full" value={jobCustomer} onChange={(e) => setJobCustomer(e.target.value)} disabled={!canEdit || pending}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <fieldset disabled={!canEdit || pending}>
              <legend className="text-sm text-[var(--ob-text-muted)]">Assign staff</legend>
              <div className="mt-1 space-y-1">
                {staff.map((s) => (
                  <label key={s.id} className="ob-touch-target flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={jobStaff.includes(s.id)}
                      onChange={(e) =>
                        setJobStaff(e.target.checked ? [...jobStaff, s.id] : jobStaff.filter((id) => id !== s.id))
                      }
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Scheduled at (optional)</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={jobWhen} onChange={(e) => setJobWhen(e.target.value)} disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Notes (optional)</span>
              <input className="ob-input mt-1 w-full" value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending || services.length === 0 || customers.length === 0}>
                {pending ? "Saving…" : editingJob ? "Save job" : "Request job"}
              </button>
              {editingJob ? (
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startJobEdit(null)}>Cancel</button>
              ) : null}
            </div>
          </form>
        </Card>
        {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
      </div>
      <div className="space-y-4 lg:col-span-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Service catalogue</h2>
          <div className="space-y-2">
            {services.length === 0 ? (
              <Card className="p-4 text-sm text-[var(--ob-text-muted)]">No services yet. Add one to start taking jobs.</Card>
            ) : services.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.name}
                      {!s.isActive ? <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">Inactive</span> : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">{s.durationMinutes} min · ₹{s.price}{s.description ? ` · ${s.description}` : ""}</p>
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => run(() => toggleServiceActiveAction(s.id, !s.isActive))}>{s.isActive ? "Deactivate" : "Activate"}</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startServiceEdit(s)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => run(() => deleteServiceAction(s.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Service jobs</h2>
          <div className="space-y-3">
            {SERVICE_JOB_STATUSES.map((status) => {
              const group = jobs.filter((j) => j.status === status);
              return (
                <div key={status}>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">{SERVICE_JOB_STATUS_LABELS[status]} ({group.length})</h3>
                  {group.length === 0 ? (
                    <p className="text-sm text-[var(--ob-text-muted)]">None.</p>
                  ) : group.map((j) => (
                    <Card key={j.id} className="mb-2 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{nameOf(services, j.serviceId)} — {nameOf(customers, j.customerId)}</p>
                          <p className="text-sm text-[var(--ob-text-muted)]">
                            {j.staffIds.length > 0 ? j.staffIds.map((id) => nameOf(staff, id)).join(", ") : "Unassigned"}
                            {j.scheduledAt ? ` · ${new Date(j.scheduledAt).toLocaleString()}` : ""}
                          </p>
                          {j.notes ? <p className="text-sm text-[var(--ob-text-muted)]">{j.notes}</p> : null}
                        </div>
                        {canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            {nextJobStatus(j.status) ? (
                              <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => advanceServiceJobAction(j.id))}>
                                Mark {SERVICE_JOB_STATUS_LABELS[nextJobStatus(j.status)!].toLowerCase()}
                              </button>
                            ) : null}
                            <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startJobEdit(j)}>Edit</button>
                            <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => run(() => deleteServiceJobAction(j.id))}>Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
```

Note: the catalogue hardcodes `₹` — both demo brands use INR (`currency_code` in both packs), matching the Staff manager's simplicity. Do not add a currency prop.

- [ ] **Step 3: Wire the page**

Replace `src/app/(workspace)/manager/services/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { ServicesManager } from "@/components/manager/services-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ServicesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("services")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Services">
        <ManagerSubnav activeHref="/manager/services" />
        <EmptyState
          title="Services is not connected to live workspaces yet"
          description="Service catalogues and jobs need the operations tables in the live database. Demo workspaces have full service management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Services">
      <ManagerSubnav activeHref="/manager/services" />
      <ServicesManager
        services={ops.services}
        jobs={ops.serviceJobs}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): `/manager/services` shows the Catering Coffee Bar fixture and the scheduled job; create a service ("Table Service", 30 min, ₹500), create a job for it (walk-in customer, one staff, no schedule → status Requested), try advancing it without staff/time after removing assignment via Edit → error message appears; assign staff + time via Edit, advance → Scheduled → In progress → Completed; delete the created job and service; reload — fixtures intact, created records gone. Check 375px: forms stack, no overflow.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-ops-actions.ts src/components/manager/services-manager.tsx "src/app/(workspace)/manager/services/page.tsx"
git commit -m "feat: services catalogue and service jobs board"
```

---

### Task 4: Appointments module

**Files:**
- Create: `src/components/manager/appointments-manager.tsx`
- Modify: `src/services/manager-ops-actions.ts` (append), `src/app/(workspace)/manager/appointments/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers (`guardOps`, `knownIds`, `appendOps`, `patchOps`, `revalidateOps`, `auditOps`), Task 2 `validateAppointmentInput`, `groupAppointments`, `APPOINTMENT_STATUS_LABELS`, `newOpsId`, `loadDemoOperations`, `listDemoStaff`, `mergeDemoCustomers`.
- Produces: `saveAppointmentAction(id: string | null, input: AppointmentInput)`, `setAppointmentStatusAction(id, status: "completed" | "cancelled")`, `deleteAppointmentAction(id)`; component `AppointmentsManager({ appointments, customers, staff, services, canEdit })` (all pick-lists `{id,name}[]`).

- [ ] **Step 1: Append appointment actions**

Append to `src/services/manager-ops-actions.ts` (add imports at top: `validateAppointmentInput, type AppointmentInput` from `@/lib/manager/appointments`; `Appointment` added to the `@/types/operations` import):

```ts
export async function saveAppointmentAction(id: string | null, input: AppointmentInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateAppointmentInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "appointmentOverrides", id, parsed.value);
  } else {
    const appointment: Appointment = {
      id: newOpsId("apt"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "scheduled",
    };
    await appendOps(guard.code, "appointments", appointment);
    await auditOps(guard, "appointment.created", "appointment", appointment.id, appointment.title);
  }
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function setAppointmentStatusAction(id: string, status: "completed" | "cancelled") {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const pack = getDemoBrandPack(guard.code);
  const ops = mergeOperations(pack, await readDemoMutableBucket(guard.code));
  const appointment = ops.appointments.find((a) => a.id === id);
  if (!appointment) return { ok: false as const, message: "Appointment not found." };
  if (appointment.status !== "scheduled") {
    return { ok: false as const, message: "Only scheduled appointments can change status." };
  }
  await patchOps(guard.code, "appointmentOverrides", id, { status });
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}

export async function deleteAppointmentAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "appointmentOverrides", id, { deleted: true });
  revalidateOps("/manager/appointments");
  return { ok: true as const };
}
```

- [ ] **Step 2: Build the component**

Create `src/components/manager/appointments-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { APPOINTMENT_STATUS_LABELS, groupAppointments } from "@/lib/manager/appointments";
import {
  deleteAppointmentAction,
  saveAppointmentAction,
  setAppointmentStatusAction,
} from "@/services/manager-ops-actions";
import type { Appointment } from "@/types/operations";

type Option = { id: string; name: string };

// datetime-local inputs need LOCAL time; stored timestamps are ISO/UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AppointmentsManager({
  appointments,
  customers,
  staff,
  services,
  canEdit,
}: {
  appointments: Appointment[];
  customers: Option[];
  staff: Option[];
  services: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [title, setTitle] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [notes, setNotes] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(appointment: Appointment | null) {
    setEditing(appointment);
    setTitle(appointment?.title ?? "");
    setCustomerId(appointment?.customerId ?? "");
    setStaffIds(appointment?.staffIds ?? []);
    setStartsAt(appointment ? toLocalInput(appointment.startsAt) : "");
    setEndsAt(appointment ? toLocalInput(appointment.endsAt) : "");
    setLocation(appointment?.location ?? "");
    setServiceId(appointment?.serviceId ?? "");
    setNotes(appointment?.notes ?? "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((p) => p.id === id)?.name ?? "Unknown" : null;
  const groups = groupAppointments(appointments, new Date());
  const sections = [
    { label: "Today", items: groups.today },
    { label: "Upcoming", items: groups.upcoming },
    { label: "Past", items: groups.past },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit appointment" : "New appointment"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveAppointmentAction(editing?.id ?? null, {
                title,
                customerId: customerId || undefined,
                staffIds,
                startsAt,
                endsAt,
                location,
                serviceId: serviceId || undefined,
                notes,
              }),
            );
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Title</span>
            <input className="ob-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <fieldset disabled={!canEdit || pending}>
            <legend className="text-sm text-[var(--ob-text-muted)]">Staff</legend>
            <div className="mt-1 space-y-1">
              {staff.map((s) => (
                <label key={s.id} className="ob-touch-target flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={staffIds.includes(s.id)} onChange={(e) => setStaffIds(e.target.checked ? [...staffIds, s.id] : staffIds.filter((id) => id !== s.id))} />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Starts</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Ends</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required disabled={!canEdit || pending} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Location (optional)</span>
            <input className="ob-input mt-1 w-full" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Service (optional)</span>
            <select className="ob-input mt-1 w-full" value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Notes (optional)</span>
            <input className="ob-input mt-1 w-full" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Schedule"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        {sections.map((section) => (
          <section key={section.label}>
            <h2 className="mb-2 text-sm font-semibold">{section.label} ({section.items.length})</h2>
            {section.items.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">No appointments.</p>
            ) : section.items.map((a) => (
              <Card key={a.id} className="mb-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {a.title}
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{APPOINTMENT_STATUS_LABELS[a.status]}</span>
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {new Date(a.startsAt).toLocaleString()} – {new Date(a.endsAt).toLocaleTimeString()}
                      {nameOf(customers, a.customerId) ? ` · ${nameOf(customers, a.customerId)}` : ""}
                      {a.location ? ` · ${a.location}` : ""}
                    </p>
                    {a.staffIds.length > 0 ? (
                      <p className="text-sm text-[var(--ob-text-muted)]">{a.staffIds.map((id) => nameOf(staff, id)).join(", ")}</p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {a.status === "scheduled" ? (
                        <>
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setAppointmentStatusAction(a.id, "completed"))}>Complete</button>
                          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => setAppointmentStatusAction(a.id, "cancelled"))}>Cancel</button>
                        </>
                      ) : null}
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startEdit(a)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteAppointmentAction(a.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

Replace `src/app/(workspace)/manager/appointments/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { AppointmentsManager } from "@/components/manager/appointments-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function AppointmentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("appointments")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Meetings & Appointments">
        <ManagerSubnav activeHref="/manager/appointments" />
        <EmptyState
          title="Appointments is not connected to live workspaces yet"
          description="Meetings and appointments need the operations tables in the live database. Demo workspaces have full scheduling today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Meetings & Appointments">
      <ManagerSubnav activeHref="/manager/appointments" />
      <AppointmentsManager
        appointments={ops.appointments}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        services={ops.services.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): `/manager/appointments` shows the fixture in Today (BR-1); create an appointment with end before start → validation error; create a valid one tomorrow → appears in Upcoming; Complete it → status badge changes; create another and Cancel it; Edit one (change title) → persists after reload; delete created records. 375px check.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-ops-actions.ts src/components/manager/appointments-manager.tsx "src/app/(workspace)/manager/appointments/page.tsx"
git commit -m "feat: appointments scheduling with today/upcoming/past groups"
```

---

### Task 5: Tasks module

**Files:**
- Create: `src/components/manager/tasks-manager.tsx`
- Modify: `src/services/manager-ops-actions.ts` (append), `src/app/(workspace)/manager/tasks/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers, Task 2 `validateTaskInput`, `isTaskOverdue`, `TASK_PRIORITIES`, `TASK_PRIORITY_LABELS`, `TASK_STATUS_LABELS`, `newOpsId`.
- Produces: `saveTaskAction(id: string | null, input: TaskInput)`, `setTaskStatusAction(id, status: TaskStatus)`, `deleteTaskAction(id)`; component `TasksManager({ tasks, staff, customers, canEdit })`.

- [ ] **Step 1: Append task actions**

Append to `src/services/manager-ops-actions.ts` (add imports: `validateTaskInput, type TaskInput` from `@/lib/manager/tasks`; `Task, TaskStatus` added to the operations type import):

```ts
export async function saveTaskAction(id: string | null, input: TaskInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateTaskInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "taskOverrides", id, parsed.value);
  } else {
    const task: Task = {
      id: newOpsId("task"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "open",
    };
    await appendOps(guard.code, "tasks", task);
    await auditOps(guard, "task.created", "task", task.id, task.title);
  }
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function setTaskStatusAction(id: string, status: TaskStatus) {
  if (!["open", "in_progress", "done"].includes(status)) {
    return { ok: false as const, message: "Invalid status." };
  }
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "taskOverrides", id, { status });
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}

export async function deleteTaskAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "taskOverrides", id, { deleted: true });
  revalidateOps("/manager/tasks");
  return { ok: true as const };
}
```

- [ ] **Step 2: Build the component**

Create `src/components/manager/tasks-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { isTaskOverdue, TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/manager/tasks";
import { deleteTaskAction, saveTaskAction, setTaskStatusAction } from "@/services/manager-ops-actions";
import type { Task, TaskStatus } from "@/types/operations";

type Option = { id: string; name: string };
type Filter = "all" | TaskStatus | "overdue";

const PRIORITY_STYLES: Record<Task["priority"], string> = {
  high: "bg-[#fbeaec] text-[#be123c]",
  medium: "bg-[#fdf1e3] text-[#b45309]",
  low: "bg-[var(--ob-surface-muted)] text-[var(--ob-text-muted)]",
};

// datetime-local inputs need LOCAL time; stored timestamps are ISO/UTC.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TasksManager({
  tasks,
  staff,
  customers,
  canEdit,
}: {
  tasks: Task[];
  staff: Option[];
  customers: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(task: Task | null) {
    setEditing(task);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setAssignee(task?.assigneeStaffId ?? "");
    setCustomerId(task?.customerId ?? "");
    setPriority(task?.priority ?? "medium");
    setDueAt(task?.dueAt ? toLocalInput(task.dueAt) : "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((p) => p.id === id)?.name ?? "Unknown" : null;
  const now = new Date();
  const visible = tasks.filter((t) => {
    if (filter === "all") return true;
    if (filter === "overdue") return isTaskOverdue(t, now);
    return t.status === filter;
  });
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In progress" },
    { key: "done", label: "Done" },
    { key: "overdue", label: "Overdue" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit task" : "New task"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveTaskAction(editing?.id ?? null, {
                title,
                description,
                assigneeStaffId: assignee || undefined,
                customerId: customerId || undefined,
                priority,
                dueAt: dueAt || undefined,
              }),
            );
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Title</span>
            <input className="ob-input mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Description (optional)</span>
            <input className="ob-input mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={!canEdit || pending} />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Assignee (optional)</span>
            <select className="ob-input mt-1 w-full" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!canEdit || pending}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Priority</span>
              <select className="ob-input mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!canEdit || pending}>
                {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Due (optional)</span>
              <input className="ob-input mt-1 w-full" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} disabled={!canEdit || pending} />
            </label>
          </div>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add task"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="lg:col-span-2">
        <div className="mb-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`ob-touch-target rounded-full border px-3 text-sm ${filter === f.key ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white" : "border-[var(--ob-border)]"}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {visible.length === 0 ? (
            <Card className="p-4 text-sm text-[var(--ob-text-muted)]">No tasks match this filter.</Card>
          ) : visible.map((t) => {
            const overdue = isTaskOverdue(t, now);
            return (
              <Card key={t.id} className={`p-4 ${overdue ? "border border-[#be123c]" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t.title}
                      <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${PRIORITY_STYLES[t.priority]}`}>{TASK_PRIORITY_LABELS[t.priority]}</span>
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">{TASK_STATUS_LABELS[t.status]}</span>
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {nameOf(staff, t.assigneeStaffId) ?? "Unassigned"}
                      {nameOf(customers, t.customerId) ? ` · ${nameOf(customers, t.customerId)}` : ""}
                      {t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleString()}` : ""}
                      {overdue ? " · OVERDUE" : ""}
                    </p>
                    {t.description ? <p className="text-sm text-[var(--ob-text-muted)]">{t.description}</p> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      {t.status === "open" ? (
                        <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "in_progress"))}>Start</button>
                      ) : null}
                      {t.status !== "done" ? (
                        <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "done"))}>Done</button>
                      ) : (
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => setTaskStatusAction(t.id, "open"))}>Reopen</button>
                      )}
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startEdit(t)}>Edit</button>
                      <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteTaskAction(t.id))}>Delete</button>
                    </div>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

Replace `src/app/(workspace)/manager/tasks/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { TasksManager } from "@/components/manager/tasks-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function TasksPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("tasks")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Tasks & Activities">
        <ManagerSubnav activeHref="/manager/tasks" />
        <EmptyState
          title="Tasks is not connected to live workspaces yet"
          description="Tasks and activities need the operations tables in the live database. Demo workspaces have full task management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Tasks & Activities">
      <ManagerSubnav activeHref="/manager/tasks" />
      <TasksManager
        tasks={ops.tasks}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        canEdit
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): `/manager/tasks` shows the overdue fixture highlighted; Overdue filter shows only it; create a task with yesterday's due date → overdue styling; Start → In progress; Done → Done chip, disappears from Overdue; Reopen works; edit + delete created task; reload persists. 375px check.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-ops-actions.ts src/components/manager/tasks-manager.tsx "src/app/(workspace)/manager/tasks/page.tsx"
git commit -m "feat: tasks with priorities, due dates and overdue tracking"
```

---

### Task 6: Schedules module (week grid)

**Files:**
- Create: `src/components/manager/schedules-manager.tsx`
- Modify: `src/services/manager-ops-actions.ts` (append), `src/app/(workspace)/manager/schedules/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers, Task 2 `validateShiftInput`, `isOnShift`, `weekDays`, `newOpsId`, type `Shift`.
- Produces: `saveShiftAction(id: string | null, input: ShiftInput)`, `deleteShiftAction(id)`; component `SchedulesManager({ shifts, staff, canEdit })`.

- [ ] **Step 1: Append shift actions**

Append to `src/services/manager-ops-actions.ts` (add imports: `validateShiftInput, type ShiftInput` from `@/lib/manager/schedules`; `Shift` added to the operations type import):

```ts
export async function saveShiftAction(id: string | null, input: ShiftInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateShiftInput(input, (await knownIds(guard.code)).staffIds);
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "shiftOverrides", id, parsed.value);
  } else {
    const shift: Shift = { id: newOpsId("shift"), brand_id: guard.brandId, ...parsed.value };
    await appendOps(guard.code, "shifts", shift);
    await auditOps(guard, "shift.created", "shift", shift.id, `${shift.date} ${shift.start}-${shift.end}`);
  }
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}

export async function deleteShiftAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "shiftOverrides", id, { deleted: true });
  revalidateOps("/manager/schedules");
  return { ok: true as const };
}
```

- [ ] **Step 2: Build the component**

Create `src/components/manager/schedules-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { isOnShift, weekDays } from "@/lib/manager/schedules";
import { deleteShiftAction, saveShiftAction } from "@/services/manager-ops-actions";
import type { Shift } from "@/types/operations";

type Option = { id: string; name: string };

export function SchedulesManager({
  shifts,
  staff,
  canEdit,
}: {
  shifts: Shift[];
  staff: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState(() => new Date());
  const [editing, setEditing] = useState<Shift | null>(null);
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [note, setNote] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(shift: Shift | null) {
    setEditing(shift);
    setStaffId(shift?.staffId ?? staff[0]?.id ?? "");
    setDate(shift?.date ?? new Date().toISOString().slice(0, 10));
    setStart(shift?.start ?? "09:00");
    setEnd(shift?.end ?? "17:00");
    setNote(shift?.note ?? "");
    setError(null);
  }

  const days = weekDays(anchor);
  const now = new Date();
  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit shift" : "Add shift"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveShiftAction(editing?.id ?? null, { staffId, date, start, end, note }));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Staff member</span>
            <select className="ob-input mt-1 w-full" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!canEdit || pending}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Date</span>
            <input className="ob-input mt-1 w-full" type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={!canEdit || pending} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Start</span>
              <input className="ob-input mt-1 w-full" type="time" value={start} onChange={(e) => setStart(e.target.value)} required disabled={!canEdit || pending} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">End</span>
              <input className="ob-input mt-1 w-full" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required disabled={!canEdit || pending} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
            <input className="ob-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending || staff.length === 0}>
              {pending ? "Saving…" : editing ? "Save changes" : "Add shift"}
            </button>
            {editing ? (
              <>
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" disabled={pending} onClick={() => run(() => deleteShiftAction(editing.id))}>Delete</button>
                <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
              </>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => setAnchor(new Date(anchor.getTime() - 7 * 86400000))}>← Prev week</button>
          <p className="text-sm font-medium">{dayLabel(days[0])} – {dayLabel(days[6])}</p>
          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => setAnchor(new Date(anchor.getTime() + 7 * 86400000))}>Next week →</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[var(--ob-border)]">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--ob-surface-muted)]">
                <th className="p-2 text-left font-medium">Staff</th>
                {days.map((day) => (
                  <th key={day} className="p-2 text-left font-medium">{dayLabel(day)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={8} className="p-3 text-[var(--ob-text-muted)]">No active staff. Add staff first.</td></tr>
              ) : staff.map((member) => {
                const onShift = shifts.some((s) => s.staffId === member.id && isOnShift(s, now));
                return (
                  <tr key={member.id} className="border-t border-[var(--ob-border)]">
                    <td className="p-2 align-top font-medium">
                      {member.name}
                      {onShift ? <span className="ml-1 rounded bg-[#e8f4ec] px-1.5 py-0.5 text-xs text-[#15803d]">On shift</span> : null}
                    </td>
                    {days.map((day) => {
                      const cell = shifts.filter((s) => s.staffId === member.id && s.date === day);
                      return (
                        <td key={day} className="p-2 align-top">
                          {cell.length === 0 ? (
                            <span className="text-xs text-[var(--ob-text-muted)]">—</span>
                          ) : cell.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="mb-1 block w-full rounded bg-[var(--ob-surface-muted)] px-2 py-1 text-left text-xs hover:bg-[var(--ob-border)]"
                              onClick={() => startEdit(s)}
                              title={s.note || undefined}
                            >
                              {s.start}–{s.end}{s.note ? ` · ${s.note}` : ""}
                            </button>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">Tap a shift chip to edit or delete it. The grid scrolls sideways on small screens.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

Replace `src/app/(workspace)/manager/schedules/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { SchedulesManager } from "@/components/manager/schedules-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function SchedulesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("schedules")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Schedules">
        <ManagerSubnav activeHref="/manager/schedules" />
        <EmptyState
          title="Schedules is not connected to live workspaces yet"
          description="Shift rotas need the operations tables in the live database. Demo workspaces have full scheduling today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  return (
    <PageShell title="Schedules">
      <ManagerSubnav activeHref="/manager/schedules" />
      <SchedulesManager
        shifts={ops.shifts}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): `/manager/schedules` shows today's fixture shifts in the current week; "On shift" badge appears only if the current UTC time falls inside a fixture window (verify against the clock, don't assume); add a shift for tomorrow, edit it via chip click, delete it; prev/next week navigation changes the header dates; end-before-start rejected. 375px: grid scrolls inside its container, page itself has no overflow.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-ops-actions.ts src/components/manager/schedules-manager.tsx "src/app/(workspace)/manager/schedules/page.tsx"
git commit -m "feat: weekly shift schedule grid with on-shift indicator"
```

---

### Task 7: Visits module

**Files:**
- Create: `src/components/manager/visits-manager.tsx`
- Modify: `src/services/manager-ops-actions.ts` (append), `src/app/(workspace)/manager/visits/page.tsx`

**Interfaces:**
- Consumes: Task 3 helpers, Task 2 `validateVisitInput`, `visitTransitionError`, `newOpsId`, `mergeOperations`, type `FieldVisit`.
- Produces: `saveVisitAction(id: string | null, input: VisitInput)`, `checkInVisitAction(id)`, `checkOutVisitAction(id, report: string)`, `deleteVisitAction(id)`; component `VisitsManager({ visits, customers, staff, canEdit })`.

- [ ] **Step 1: Append visit actions**

Append to `src/services/manager-ops-actions.ts` (add imports: `validateVisitInput, visitTransitionError, type VisitInput` from `@/lib/manager/visits`; `FieldVisit` added to the operations type import):

```ts
export async function saveVisitAction(id: string | null, input: VisitInput) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const parsed = validateVisitInput(input, await knownIds(guard.code));
  if (!parsed.ok) return parsed;
  if (id) {
    await patchOps(guard.code, "visitOverrides", id, parsed.value);
  } else {
    const visit: FieldVisit = {
      id: newOpsId("visit"),
      brand_id: guard.brandId,
      ...parsed.value,
      status: "planned",
      checkInAt: null,
      checkOutAt: null,
      report: null,
    };
    await appendOps(guard.code, "visits", visit);
    await auditOps(guard, "visit.created", "visit", visit.id, visit.purpose);
  }
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkInVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const pack = getDemoBrandPack(guard.code);
  const ops = mergeOperations(pack, await readDemoMutableBucket(guard.code));
  const visit = ops.visits.find((v) => v.id === id);
  if (!visit) return { ok: false as const, message: "Visit not found." };
  const error = visitTransitionError(visit, "check_in");
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "visitOverrides", id, {
    status: "checked_in",
    checkInAt: new Date().toISOString(),
  });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function checkOutVisitAction(id: string, report: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  const pack = getDemoBrandPack(guard.code);
  const ops = mergeOperations(pack, await readDemoMutableBucket(guard.code));
  const visit = ops.visits.find((v) => v.id === id);
  if (!visit) return { ok: false as const, message: "Visit not found." };
  const error = visitTransitionError(visit, "check_out", report);
  if (error) return { ok: false as const, message: error };
  await patchOps(guard.code, "visitOverrides", id, {
    status: "completed",
    checkOutAt: new Date().toISOString(),
    report: report.trim().slice(0, 500),
  });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}

export async function deleteVisitAction(id: string) {
  const guard = await guardOps();
  if (!guard.ok) return guard;
  await patchOps(guard.code, "visitOverrides", id, { deleted: true });
  revalidateOps("/manager/visits");
  return { ok: true as const };
}
```

- [ ] **Step 2: Build the component**

Create `src/components/manager/visits-manager.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  checkInVisitAction,
  checkOutVisitAction,
  deleteVisitAction,
  saveVisitAction,
} from "@/services/manager-ops-actions";
import type { FieldVisit } from "@/types/operations";

type Option = { id: string; name: string };

export function VisitsManager({
  visits,
  customers,
  staff,
  canEdit,
}: {
  visits: FieldVisit[];
  customers: Option[];
  staff: Option[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FieldVisit | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [report, setReport] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(visit: FieldVisit | null) {
    setEditing(visit);
    setCustomerId(visit?.customerId ?? customers[0]?.id ?? "");
    setStaffId(visit?.staffId ?? staff[0]?.id ?? "");
    setPurpose(visit?.purpose ?? "");
    setError(null);
  }

  const nameOf = (list: Option[], id: string) => list.find((p) => p.id === id)?.name ?? "Unknown";
  const groups = [
    { status: "planned" as const, label: "Planned" },
    { status: "checked_in" as const, label: "Checked in" },
    { status: "completed" as const, label: "Completed" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="h-fit p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? "Edit visit" : "Plan a visit"}</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveVisitAction(editing?.id ?? null, { customerId, staffId, purpose }));
            if (ok) startEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer</span>
            <select className="ob-input mt-1 w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={!canEdit || pending}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Staff member</span>
            <select className="ob-input mt-1 w-full" value={staffId} onChange={(e) => setStaffId(e.target.value)} disabled={!canEdit || pending}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Purpose</span>
            <input className="ob-input mt-1 w-full" value={purpose} onChange={(e) => setPurpose(e.target.value)} required maxLength={200} disabled={!canEdit || pending} />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={!canEdit || pending || customers.length === 0 || staff.length === 0}>
              {pending ? "Saving…" : editing ? "Save changes" : "Plan visit"}
            </button>
            {editing ? (
              <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => startEdit(null)}>Cancel</button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="space-y-4 lg:col-span-2">
        {groups.map((group) => {
          const items = visits.filter((v) => v.status === group.status);
          return (
            <section key={group.status}>
              <h2 className="mb-2 text-sm font-semibold">{group.label} ({items.length})</h2>
              {items.length === 0 ? (
                <p className="text-sm text-[var(--ob-text-muted)]">No visits.</p>
              ) : items.map((v) => (
                <Card key={v.id} className="mb-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{v.purpose}</p>
                      <p className="text-sm text-[var(--ob-text-muted)]">
                        {nameOf(customers, v.customerId)} · {nameOf(staff, v.staffId)}
                        {v.checkInAt ? ` · in ${new Date(v.checkInAt).toLocaleString()}` : ""}
                        {v.checkOutAt ? ` · out ${new Date(v.checkOutAt).toLocaleString()}` : ""}
                      </p>
                      {v.report ? <p className="mt-1 text-sm">{v.report}</p> : null}
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        {v.status === "planned" ? (
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => run(() => checkInVisitAction(v.id))}>Check in</button>
                        ) : null}
                        {v.status === "checked_in" ? (
                          <button type="button" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-3 text-sm font-medium text-white disabled:opacity-50" disabled={pending} onClick={() => { setCheckoutId(v.id); setReport(""); setError(null); }}>Check out</button>
                        ) : null}
                        {v.status === "planned" ? (
                          <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" onClick={() => startEdit(v)}>Edit</button>
                        ) : null}
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm" disabled={pending} onClick={() => run(() => deleteVisitAction(v.id))}>Delete</button>
                      </div>
                    ) : null}
                  </div>
                  {checkoutId === v.id ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const ok = await run(() => checkOutVisitAction(v.id, report));
                        if (ok) setCheckoutId(null);
                      }}
                    >
                      <label className="block text-sm">
                        <span className="text-[var(--ob-text-muted)]">Visit report (required)</span>
                        <textarea className="ob-input mt-1 w-full" rows={3} value={report} onChange={(e) => setReport(e.target.value)} maxLength={500} disabled={pending} />
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50" disabled={pending}>Complete visit</button>
                        <button type="button" className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm" onClick={() => setCheckoutId(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : null}
                </Card>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire the page**

Replace `src/app/(workspace)/manager/visits/page.tsx` entirely with:

```tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { VisitsManager } from "@/components/manager/visits-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function VisitsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("visits")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Visits & Field Ops">
        <ManagerSubnav activeHref="/manager/visits" />
        <EmptyState
          title="Visits is not connected to live workspaces yet"
          description="Field visits need the operations tables in the live database. Demo workspaces have full visit tracking today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Visits & Field Ops">
      <ManagerSubnav activeHref="/manager/visits" />
      <VisitsManager
        visits={ops.visits}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): BR-2 `/manager/visits` shows the completed fixture WITH its report and the planned one; plan a new visit → Planned; Check in → moves to Checked in with a real timestamp; Check out with empty report → error; with report → Completed, report shown; delete created visit. 375px check.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-ops-actions.ts src/components/manager/visits-manager.tsx "src/app/(workspace)/manager/visits/page.tsx"
git commit -m "feat: field visits with check-in, check-out and reports"
```

---

### Task 8: Cross-linking — customer timeline + Overview rollups

**Files:**
- Create: `src/components/customers/customer-operations-timeline.tsx`
- Modify: `src/app/(workspace)/customers/[customerId]/page.tsx` (demo branch only), `src/app/(workspace)/manager/page.tsx`

**Interfaces:**
- Consumes: Task 2 `customerOperationsTimeline`, `overviewRollups`, `OpsTimelineRow`, `loadDemoOperations`.
- Produces: component `CustomerOperationsTimeline({ rows }: { rows: OpsTimelineRow[] })`; Overview rollup cards linking to the five modules.

- [ ] **Step 1: Timeline component**

Create `src/components/customers/customer-operations-timeline.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { OpsTimelineRow } from "@/lib/manager/ops-selectors";

const KIND_LABELS: Record<OpsTimelineRow["kind"], string> = {
  appointment: "Appointment",
  visit: "Visit",
  job: "Service job",
  task: "Task",
};

export function CustomerOperationsTimeline({ rows }: { rows: OpsTimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
        No operational records for this customer yet.
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link key={`${row.kind}-${row.id}`} href={row.href} className="block">
          <Card className="p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-[var(--ob-text-muted)]">
                {KIND_LABELS[row.kind]} · {row.status.replace(/_/g, " ")}
                {row.when ? ` · ${new Date(row.when).toLocaleString()}` : ""}
              </p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire the customer detail page (demo branch)**

In `src/app/(workspace)/customers/[customerId]/page.tsx`:

Add imports:

```tsx
import { CustomerOperationsTimeline } from "@/components/customers/customer-operations-timeline";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { customerOperationsTimeline } from "@/lib/manager/ops-selectors";
```

In the demo branch, after `const orders = await listDemoOrdersForCustomer(customerId, code);` add:

```tsx
    const ops = await loadDemoOperations(code);
    const operationsRows = customerOperationsTimeline(
      customerId,
      { appointments: ops.appointments, visits: ops.visits, jobs: ops.serviceJobs, tasks: ops.tasks },
      Object.fromEntries(ops.services.map((s) => [s.id, s.name])),
    );
```

and after the `CustomerOrdersTable` element inside the demo-branch return, add:

```tsx
        <h2 className="mb-3 mt-6 text-sm font-semibold">Operations</h2>
        <CustomerOperationsTimeline rows={operationsRows} />
```

The live branch is untouched.

- [ ] **Step 3: Overview rollups + real descriptions**

In `src/app/(workspace)/manager/page.tsx`:

Add imports:

```tsx
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { overviewRollups } from "@/lib/manager/ops-selectors";
```

Replace the `MODULE_DESCRIPTIONS` values:

```tsx
const MODULE_DESCRIPTIONS: Record<string, string> = {
  staff: "Profiles, roles and availability.",
  services: "Service catalogue, requests and work orders.",
  appointments: "Meetings, tastings and scheduled sessions.",
  visits: "Field visits with check-in and reports.",
  schedules: "Staff shifts and the weekly rota.",
  tasks: "To-dos with priorities and due dates.",
};
```

In the demo path, after `const summary = staffAvailabilitySummary(staff);` add:

```tsx
  const ops = await loadDemoOperations(toDemoBrandCode(ws.brand.code));
  const rollups = overviewRollups(
    { appointments: ops.appointments, tasks: ops.tasks, shifts: ops.shifts, visits: ops.visits, jobs: ops.serviceJobs },
    new Date(),
  );
  const rollupCards = [
    { label: "Today's appointments", value: rollups.todayAppointments, href: "/manager/appointments" },
    { label: "Overdue tasks", value: rollups.overdueTasks, href: "/manager/tasks" },
    { label: "On shift now", value: rollups.onShiftNow, href: "/manager/schedules" },
    { label: "Active visits", value: rollups.activeVisits, href: "/manager/visits" },
    { label: "Open jobs", value: rollups.openJobs, href: "/manager/services" },
  ];
```

and in the demo return, between the staff stats grid and the module cards grid, insert:

```tsx
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {rollupCards.map((card) => (
          <Link key={card.label} href={card.href} className="block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="text-sm text-[var(--ob-text-muted)]">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </Card>
          </Link>
        ))}
      </div>
```

- [ ] **Step 4: Verify**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): `/manager` shows five rollup cards; counts match module lists (e.g. BR-1 open jobs = 1, overdue tasks ≥ 1); each card navigates to its module. `/customers/c2` shows the Operations section with the tasting appointment and catering job; rows deep-link correctly. `/customers/c1` (walk-in, no ops records) shows the honest empty note. Switch to BR-2 (brand switcher in the workspace shell) and check `/customers/fc2` shows the completed visit with report title + in-progress job.

- [ ] **Step 5: Commit**

```bash
git add src/components/customers/customer-operations-timeline.tsx "src/app/(workspace)/customers/[customerId]/page.tsx" "src/app/(workspace)/manager/page.tsx"
git commit -m "feat: customer operations timeline and overview rollup cards"
```

---

### Task 9: Parked polish batch

**Files:**
- Modify: `src/components/workspace/command-palette.tsx`, `src/app/(workspace)/manager/page.tsx`, `src/components/manager/staff-manager.tsx`, plus any components found by the sweeps below.

**Interfaces:**
- Consumes: `useWorkspace()` from `@/components/workspace/workspace-provider` (already used by `app-shell.tsx`; exposes `hiddenManagerModules`), `visibleManagerModules` from `@/lib/workspace/manager-modules`, `ManagerModuleKey` type.
- Produces: visibility-aware palette; gated staff stats; typed descriptions; `role="alert"` on all action error messages.

- [ ] **Step 1: Visibility-aware command palette**

In `src/components/workspace/command-palette.tsx`:

Remove the two static entries `{ href: "/manager", label: "Manager overview" }` and `{ href: "/manager/staff", label: "Staff" }` from `LINKS`. Add imports:

```tsx
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";
```

Inside `CommandPalette()`, after `const router = useRouter();` add:

```tsx
  const ws = useWorkspace();
  const links = useMemo(() => {
    const managerLinks = [
      { href: "/manager", label: "Manager overview" },
      ...visibleManagerModules(ws.hiddenManagerModules).map((m) => ({ href: m.href, label: m.label })),
    ];
    return [...LINKS, ...managerLinks];
  }, [ws.hiddenManagerModules]);
```

Change the `filtered` memo to filter `links` instead of `LINKS` (and return `links` when the query is empty; dependency array `[query, links]`).

- [ ] **Step 2: Gate Overview staff stats + type descriptions**

In `src/app/(workspace)/manager/page.tsx`:

1. Wrap the staff stats grid (`<div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">…</div>`) in `{!ws.hiddenManagerModules.includes("staff") ? ( … ) : null}`.
2. Import `type ManagerModuleKey` from `@/lib/workspace/manager-modules` and change `MODULE_DESCRIPTIONS` to `Record<ManagerModuleKey, string>`.

- [ ] **Step 3: `role="alert"` sweep**

Run a grep for `text-[var(--ob-danger)]` across `src/components` and `src/app`. For every error `<p>`/element that lacks `role="alert"`, add it (known starting point: `src/components/manager/staff-manager.tsx` line ~148; check customer-editor, product/offer forms, billing error displays). Do not add it to non-error danger-colored text.

- [ ] **Step 4: Stale-error clearing sweep**

Grep components with `setError(` for success paths that refresh without clearing the error. The contract: every successful action result clears the error (`setError(null)`) before/with `router.refresh()`. `staff-manager.tsx` already complies; fix any component that doesn't (check customer-editor and any form touched in this plan).

- [ ] **Step 5: Trailing-newline sweep**

Every file created or modified by this plan must end with exactly one trailing newline. Check with: `for f in $(git diff --name-only dadc81d HEAD -- 'src/*'); do [ -n "$(tail -c 1 "$f")" ] && echo "$f"; done` — fix any listed file.

- [ ] **Step 6: Verify + commit**

Run: `npm test && npx next typegen && npx tsc --noEmit` — Expected: PASS, clean.
Browser (Playwright isolated, :3003): hide the Tasks module via Manager visibility settings → ⌘K palette no longer lists "Tasks & Activities", Overview hides nothing else incorrectly; unhide → link returns. Hide Staff → Overview staff stats disappear, rollups remain.

```bash
git add -u src/
git commit -m "fix: visibility-aware palette, gated staff stats, alert roles and error clearing"
```

---

### Task 10: Full verification + E2E regression matrix

**Files:**
- No new files expected; fix any bug found via TDD (failing test first) in the relevant file.
- Evidence: `/tmp/phase2-final-e2e.md` (delete before finishing).

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: a verified branch; final report.

- [ ] **Step 1: Static verification**

Run: `npm test && npx next typegen && npx tsc --noEmit`
Expected: all tests PASS, tsc clean. Record counts.

- [ ] **Step 2: E2E regression matrix (Playwright MCP isolated browser, :3003)**

Rules: only `mcp__plugin_playwright_playwright__*` tools; never the user's Chrome; remove `nextjs-portal` via evaluate if the dev overlay blocks clicks; the unsafe-eval CSP console error is the only acceptable console error. Snapshot pages to find controls; record observed values per case in `/tmp/phase2-final-e2e.md`. Run every case on BR-1 unless stated; switch brands via the workspace brand switcher for the BR-2 spot checks.

1. **Billing walk-in:** add/edit qty/remove a line, save bill with table note; order appears in `/orders` with internally consistent totals (subtotal − discount + tax = grand total); record payment → paid; dashboard/analytics totals reflect it.
2. **Billing offer math:** saved customer + `FOOD50` on 2× Avocado Toast → discount exactly ₹150 (cap), grand total 514.5. Also `HAPPY10` on a ₹680+ order → 10% capped at ₹200.
3. **Orders ops:** change a demo order's status; record payment on an unpaid order.
4. **Customers:** create via walk-in save-as-customer; edit name/phone; reload → persisted.
5. **Products:** create a product, edit its price; it appears in the Billing catalog at the new price.
6. **Staff (Phase 1 regression):** add, edit, change availability, deactivate, reactivate.
7. **Each ops module:** create → edit → transition → delete; verify lists, filters (Tasks chips), and persistence after reload. Visits: check-out without report must fail. Jobs: advance chain enforced. Appointments: end≤start rejected.
8. **Cross-links:** customer timeline rows and Overview rollup counts match the module lists for both brands (BR-1 `/customers/c2`, BR-2 `/customers/fc2`).
9. **Module visibility (Phase 1 regression):** hide a module → nav entry gone, sub-nav entry gone, direct URL redirects to `/manager`, palette entry gone; unhide restores.
10. **Mobile 375×812:** drawer opens/closes, manager sub-nav scrolls, billing bill sheet usable, all interactive targets ≥44px, no page-level horizontal overflow on `/billing`, `/manager`, each module page, `/customers/c2`.

- [ ] **Step 3: Fix any failures**

For each failure: write a failing test reproducing it (unit if logic, otherwise document the exact browser repro), fix, re-run the case. Re-run Step 1 after fixes.

- [ ] **Step 4: Clean up + stop servers**

Delete `/tmp/phase2-final-e2e.md` after transcribing results into the report. Stop every dev server this program started (the :3003 background task) via TaskStop/kill; verify with `curl` that :3003 no longer responds. NEVER touch the user's own :3000 process. `git status` must be clean except intentional changes; commit any last fixes:

```bash
git add -u src/
git commit -m "fix: regression fixes from full Phase 2 verification"
```

(Skip the commit if there are no changes.)

- [ ] **Step 5: Final report**

Report: test counts, tsc status, per-case E2E results (pass/fail + observed values), commits added, servers stopped. This report feeds the whole-branch final review.