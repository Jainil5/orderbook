# CSV Demo Data + Supabase Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repo-stored CSVs the demo database, delete Supabase entirely, organize images by SKU, and ship a repo that deploys to Vercel/Railway with zero env vars.

**Architecture:** One-time export freezes the current TS brand packs (incl. generated 6-month history) into `data/demo/BR-{1,2}/*.csv`. A typed loader (raw CSV imports → mappers → date rebase) reproduces the identical `DemoBrandPack` shape, so all consumers stay untouched. Live-mode services/auth are deleted; pages/actions collapse to their existing demo branches; login becomes a brand picker.

**Tech Stack:** Next.js 16.4.5 (custom fork, turbopack), React 19, TypeScript, Tailwind v4, Vitest, motion. Zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-11-csv-demo-data-design.md`

## Global Constraints

- Work in `/Users/jainil/Documents/development/orderbook/.worktrees/csv-demo-data` (branch `feat/csv-demo-data`). All paths below are relative to that worktree.
- This is a CUSTOM Next.js fork — before writing config/framework code, check `node_modules/next/dist/docs/`. `next lint` does NOT exist; lint gate is `npx eslint .`.
- Gates after every task: `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` — all must pass before commit.
- Dataset must stay identical: same products, customers, orders, history values. No data "improvements".
- After Task 7 the app must run with ZERO environment variables.
- Never touch port 3000 (user's own server). Port 3003 serves the user's demo — do not kill it until Task 10. Agent verification uses port 3004.
- Browser verification: isolated `agent-browser` sessions only; screenshots/evidence to `/tmp`, never into the repo. Phone-first checks at 375px, 44px touch targets.
- If `next dev` re-adds the AGENTS.md block, commit it with the task's work.
- Do NOT push until Task 10 (push of main is user-authorized there).
- Re-read files before editing (user may live-edit concurrently).

---

### Task 1: Images organized by SKU

**Files:**
- Move: `public/demo/products/*.jpg` → `public/demo/products/BR-1/<SKU>.jpg` and `BR-2/<SKU>.jpg`
- Create: 4 downloaded JPGs (Unsplash hotlinks localized)
- Modify: `src/lib/demo/product-image-urls.ts` (paths only; file deleted later in Task 5)

**Interfaces:**
- Produces: image paths `/demo/products/BR-1/BV-CF-001.jpg` etc., consumed by the CSV export (Task 4) via the packs.

- [ ] **Step 1: Create brand folders and move the 24 café images**

```bash
mkdir -p public/demo/products/BR-1 public/demo/products/BR-2
cd public/demo/products
git mv flat-white.jpg BR-1/BV-CF-001.jpg
git mv cold-brew.jpg BR-1/BV-CF-002.jpg
git mv avocado-toast.jpg BR-1/BV-FD-001.jpg
git mv seasonal-pastry.jpg BR-1/BV-MS-001.jpg
git mv espresso.jpg BR-1/BV-CF-003.jpg
git mv cappuccino.jpg BR-1/BV-CF-004.jpg
git mv cortado.jpg BR-1/BV-CF-005.jpg
git mv vanilla-latte.jpg BR-1/BV-CF-006.jpg
git mv frappe.jpg BR-1/BV-CF-007.jpg
git mv iced-latte.jpg BR-1/BV-CF-008.jpg
git mv hot-chocolate.jpg BR-1/BV-CF-009.jpg
git mv mango-smoothie.jpg BR-1/BV-BV-002.jpg
git mv fresh-lime-soda.jpg BR-1/BV-BV-003.jpg
git mv bombay-grilled-sandwich.jpg BR-1/BV-FD-003.jpg
git mv pesto-penne-pasta.jpg BR-1/BV-FD-004.jpg
git mv peri-peri-fries.jpg BR-1/BV-SD-001.jpg
git mv cheesy-garlic-bread.jpg BR-1/BV-SD-002.jpg
git mv nachos-salsa.jpg BR-1/BV-SD-003.jpg
git mv hummus-pita.jpg BR-1/BV-SD-004.jpg
git mv garlic-aioli.jpg BR-1/BV-SD-005.jpg
git mv chipotle-mayo.jpg BR-1/BV-SD-006.jpg
git mv chocolate-brownie.jpg BR-1/BV-DS-001.jpg
git mv basque-cheesecake.jpg BR-1/BV-DS-002.jpg
```

- [ ] **Step 2: Move the 6 local furniture images**

```bash
git mv oslo-dining-table.jpg BR-2/CB-DN-001.jpg
git mv mesh-office-chair.jpg BR-2/CB-OF-002.jpg
git mv luna-sofa.jpg BR-2/CB-LR-003.jpg
git mv study-desk.jpg BR-2/CB-OF-005.jpg
git mv modular-shelf.jpg BR-2/CB-MS-008.jpg
```

(5 local furniture files; the 6th–8th are downloads below.)

- [ ] **Step 3: Download the 4 Unsplash hotlinks into SKU names**

```bash
curl -L --fail -o BR-1/BV-FD-002.jpg "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80&fit=crop"
curl -L --fail -o BR-2/CB-BR-004.jpg "https://images.unsplash.com/photo-1594620302200-9a762244a156?w=800&q=80&fit=crop"
curl -L --fail -o BR-2/CB-BR-006.jpg "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&q=80&fit=crop"
curl -L --fail -o BR-2/CB-DN-007.jpg "https://images.unsplash.com/photo-1503602642458-232111445657?w=800&q=80&fit=crop"
cd ../../..
```

Verify each file is a real JPEG (`file public/demo/products/BR-*/*.jpg` — all should say JPEG). If a download fails or returns HTML, retry once with `?w=800` only; if still blocked, substitute same-style stock from another free source (user-approved fallback) — never leave a broken file.

- [ ] **Step 4: Rewrite `src/lib/demo/product-image-urls.ts` paths**

Replace every value with the new SKU path, keeping the same keys. Full replacement content:

```ts
/** Demo catalog photos, named by product SKU under public/demo/products/<brand>/. */
export const DEMO_CAFE_IMAGES = {
  coffee: "/demo/products/BR-1/BV-CF-001.jpg",
  coldBrew: "/demo/products/BR-1/BV-CF-002.jpg",
  toast: "/demo/products/BR-1/BV-FD-001.jpg",
  granola: "/demo/products/BR-1/BV-FD-002.jpg",
  pastry: "/demo/products/BR-1/BV-MS-001.jpg",
  espresso: "/demo/products/BR-1/BV-CF-003.jpg",
  cappuccino: "/demo/products/BR-1/BV-CF-004.jpg",
  cortado: "/demo/products/BR-1/BV-CF-005.jpg",
  vanillaLatte: "/demo/products/BR-1/BV-CF-006.jpg",
  frappe: "/demo/products/BR-1/BV-CF-007.jpg",
  icedLatte: "/demo/products/BR-1/BV-CF-008.jpg",
  hotChocolate: "/demo/products/BR-1/BV-CF-009.jpg",
  mangoSmoothie: "/demo/products/BR-1/BV-BV-002.jpg",
  limeSoda: "/demo/products/BR-1/BV-BV-003.jpg",
  bombaySandwich: "/demo/products/BR-1/BV-FD-003.jpg",
  pestoPasta: "/demo/products/BR-1/BV-FD-004.jpg",
  periPeriFries: "/demo/products/BR-1/BV-SD-001.jpg",
  garlicBread: "/demo/products/BR-1/BV-SD-002.jpg",
  nachos: "/demo/products/BR-1/BV-SD-003.jpg",
  hummusPita: "/demo/products/BR-1/BV-SD-004.jpg",
  garlicAioli: "/demo/products/BR-1/BV-SD-005.jpg",
  chipotleMayo: "/demo/products/BR-1/BV-SD-006.jpg",
  brownie: "/demo/products/BR-1/BV-DS-001.jpg",
  cheesecake: "/demo/products/BR-1/BV-DS-002.jpg",
} as const;

export const DEMO_FURNITURE_IMAGES = {
  dining: "/demo/products/BR-2/CB-DN-001.jpg",
  officeChair: "/demo/products/BR-2/CB-OF-002.jpg",
  sofa: "/demo/products/BR-2/CB-LR-003.jpg",
  wardrobe: "/demo/products/BR-2/CB-BR-004.jpg",
  desk: "/demo/products/BR-2/CB-OF-005.jpg",
  bedside: "/demo/products/BR-2/CB-BR-006.jpg",
  stool: "/demo/products/BR-2/CB-DN-007.jpg",
  shelf: "/demo/products/BR-2/CB-MS-008.jpg",
} as const;
```

- [ ] **Step 5: Gates + visual spot check**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run` — all pass (brewery test asserts `startsWith("/demo/products/")`, still true).
Start dev on 3004 (`npm run dev -- -p 3004`, background), open `http://localhost:3004/demo?brand=BR-1` in an isolated agent-browser session, confirm POS tiles show photos (no placeholder tiles), screenshot to /tmp. Repeat BR-2. Stop the 3004 server.

- [ ] **Step 6: Commit**

```bash
git add public/demo/products src/lib/demo/product-image-urls.ts
git commit -m "refactor: demo product images named by SKU, hotlinks localized"
```

---

### Task 2: CSV parser + value coercion (pure, TDD)

**Files:**
- Create: `src/lib/demo/csv/parse-csv.ts`
- Test: `src/lib/demo/csv/parse-csv.test.ts`

**Interfaces:**
- Produces: `parseCsv(text: string): string[][]`, `parseCsvObjects(text: string, source: string): Record<string, string>[]`, and coercion helpers `str`, `reqStr`, `num`, `reqNum`, `bool`, `json` — used by mappers (Task 5).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, str, reqStr, num, reqNum, bool, json } from "./parse-csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quoted commas, escaped quotes, embedded newlines", () => {
    expect(parseCsv('a,b\n"x,y","he said ""hi"""\n"line1\nline2",z\n')).toEqual([
      ["a", "b"], ["x,y", 'he said "hi"'], ["line1\nline2", "z"],
    ]);
  });
  it("handles CRLF and trailing blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps empty cells", () => {
    expect(parseCsv("a,b,c\n1,,3\n")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });
});

describe("parseCsvObjects", () => {
  it("maps headers to cells", () => {
    expect(parseCsvObjects("id,name\np1,Flat White\n", "products.csv")).toEqual([
      { id: "p1", name: "Flat White" },
    ]);
  });
  it("throws with file+row context on ragged rows", () => {
    expect(() => parseCsvObjects("a,b\n1\n", "products.csv")).toThrow(/products\.csv: row 2/);
  });
  it("returns [] for header-only input", () => {
    expect(parseCsvObjects("a,b\n", "x.csv")).toEqual([]);
  });
});

describe("coercion", () => {
  it("str: empty → null", () => { expect(str("")).toBeNull(); expect(str("x")).toBe("x"); });
  it("reqStr throws on empty", () => { expect(() => reqStr("", "id", "f.csv")).toThrow(/f\.csv.*id/); });
  it("num: empty → null, numeric string → number", () => {
    expect(num("")).toBeNull(); expect(num("30.6")).toBe(30.6);
    expect(() => num("abc", "price", "f.csv")).toThrow(/f\.csv.*price/);
  });
  it("reqNum throws on empty", () => { expect(() => reqNum("", "price", "f.csv")).toThrow(); });
  it("bool parses true/false", () => { expect(bool("true")).toBe(true); expect(bool("false")).toBe(false); });
  it("json: empty → null, parses arrays/objects", () => {
    expect(json("")).toBeNull();
    expect(json<number[]>("[1,2]")).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/demo/csv/parse-csv.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement `parse-csv.ts`**

```ts
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else { cell += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export type CsvRow = Record<string, string>;

export function parseCsvObjects(text: string, source: string): CsvRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1).map((cells, idx) => {
    if (cells.length !== headers.length) {
      throw new Error(`${source}: row ${idx + 2} has ${cells.length} cells, expected ${headers.length}`);
    }
    const obj: CsvRow = {};
    headers.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
}

export function str(v: string): string | null { return v === "" ? null : v; }

export function reqStr(v: string, field: string, source: string): string {
  if (v === "") throw new Error(`${source}: missing required field "${field}"`);
  return v;
}

export function num(v: string, field = "", source = ""): number | null {
  if (v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`${source}: field "${field}" is not a number: ${v}`);
  return n;
}

export function reqNum(v: string, field: string, source: string): number {
  const n = num(v, field, source);
  if (n === null) throw new Error(`${source}: missing required number "${field}"`);
  return n;
}

export function bool(v: string): boolean { return v === "true"; }

export function json<T>(v: string): T | null {
  if (v === "") return null;
  return JSON.parse(v) as T;
}
```

- [ ] **Step 4: Run tests — PASS.** Run: `npx vitest run src/lib/demo/csv/parse-csv.test.ts`
- [ ] **Step 5: Gates + commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
git add src/lib/demo/csv/parse-csv.ts src/lib/demo/csv/parse-csv.test.ts
git commit -m "feat: zero-dependency CSV parser with typed coercion helpers"
```

---

### Task 3: Date rebase (pure, TDD)

**Files:**
- Create: `src/lib/demo/csv/rebase.ts`
- Test: `src/lib/demo/csv/rebase.test.ts`

**Interfaces:**
- Consumes: entity types from `@/types/database`, `@/types/manager`, `@/types/operations`; `DemoBrandPack` from `@/lib/demo/brands/types`.
- Produces: `rebasePackDates<T extends DatedPack>(pack: T, now?: Date): T`, `shiftIso(iso: string, days: number): string`, `shiftDayKey(key: string, days: number): string`, `computeOffsetDays(maxIso: string, now: Date): number` — used by load-pack (Task 5).

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { computeOffsetDays, rebasePackDates, shiftDayKey, shiftIso } from "./rebase";

const NOW = new Date(2026, 10, 11, 15, 0, 0); // Nov 11 2026, local

describe("shift helpers", () => {
  it("shiftIso adds whole days preserving time", () => {
    expect(shiftIso("2026-11-01T09:30:00.000Z", 3)).toBe("2026-11-04T09:30:00.000Z");
  });
  it("shiftDayKey shifts YYYY-MM-DD", () => {
    expect(shiftDayKey("2026-11-01", 10)).toBe("2026-11-11");
  });
  it("computeOffsetDays: newest order today → 0", () => {
    expect(computeOffsetDays(new Date(2026, 10, 11, 9, 0).toISOString(), NOW)).toBe(0);
  });
  it("computeOffsetDays: newest order 10 days ago → 10", () => {
    expect(computeOffsetDays(new Date(2026, 10, 1, 9, 0).toISOString(), NOW)).toBe(10);
  });
});

describe("rebasePackDates", () => {
  const base = {
    orders: [
      { id: "o1", created_at: new Date(2026, 10, 1, 9, 0).toISOString(), service_date: "2026-11-01" },
      { id: "o2", created_at: new Date(2026, 10, 11, 8, 0).toISOString(), service_date: null },
    ],
    payments: [{ id: "p1", created_at: new Date(2026, 10, 1, 9, 5).toISOString() }],
    offers: [{ id: "f1", starts_at: null, ends_at: null }],
    staff: [{ id: "s1", created_at: "2026-10-01T09:00:00.000Z" }],
    serviceJobs: [{ id: "j1", scheduledAt: new Date(2026, 10, 13, 10, 0).toISOString() }],
    appointments: [{ id: "a1", startsAt: new Date(2026, 10, 11, 16, 0).toISOString(), endsAt: new Date(2026, 10, 11, 17, 0).toISOString() }],
    visits: [{ id: "v1", checkInAt: null, checkOutAt: null }],
    tasks: [{ id: "t1", dueAt: new Date(2026, 10, 12, 10, 0).toISOString() }],
    shifts: [{ id: "sh1", date: "2026-11-11" }],
  };

  it("offset 0 returns equal data", () => {
    const out = rebasePackDates(base, NOW);
    expect(out.orders[0].created_at).toBe(base.orders[0].created_at);
  });

  it("shifts every dated field by the offset and keeps nulls", () => {
    const stale = { ...base, orders: [base.orders[0]], payments: [], appointments: [], serviceJobs: [], tasks: [], shifts: [{ id: "sh1", date: "2026-11-01" }] };
    const out = rebasePackDates(stale, NOW);
    expect(out.orders[0].created_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.orders[0].service_date).toBe("2026-11-11");
    expect(out.shifts[0].date).toBe("2026-11-11");
    expect(out.staff[0].created_at).toBe("2026-10-11T09:00:00.000Z");
    expect(out.visits[0].checkInAt).toBeNull();
  });

  it("does not mutate the input", () => {
    const stale = { ...base, orders: [{ ...base.orders[0] }] };
    const before = stale.orders[0].created_at;
    rebasePackDates(stale, NOW);
    expect(stale.orders[0].created_at).toBe(before);
  });
});
```

Note: the test's structural objects are intentionally partial — `rebasePackDates` is generic over `DatedPack` (Pick of the 9 dated arrays), so partial entity shapes type-check via `as` casts only if needed; prefer typing the fixture `satisfies DatedPack` with full-enough rows. If TS complains about missing entity fields, widen the fixture rows with the required fields (id/brand_id etc.) rather than casting.

- [ ] **Step 2: Run to verify failure.** Run: `npx vitest run src/lib/demo/csv/rebase.test.ts` — FAIL.

- [ ] **Step 3: Implement `rebase.ts`**

```ts
import type { DemoBrandPack } from "@/lib/demo/brands/types";

const DAY_MS = 86400000;

export type DatedPack = Pick<
  DemoBrandPack,
  "orders" | "payments" | "offers" | "staff" | "serviceJobs" | "appointments" | "visits" | "tasks" | "shifts"
>;

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function shiftIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  const mm = String(shifted.getMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${mm}-${dd}`;
}

export function computeOffsetDays(maxIso: string, now: Date): number {
  return Math.round((startOfDayMs(now) - startOfDayMs(new Date(maxIso))) / DAY_MS);
}

function shiftNullableIso(v: string | null | undefined, days: number): string | null {
  return v == null ? null : shiftIso(v, days);
}

export function rebasePackDates<T extends DatedPack>(pack: T, now: Date = new Date()): T {
  if (pack.orders.length === 0) return pack;
  const maxIso = pack.orders.reduce(
    (max, o) => (o.created_at > max ? o.created_at : max),
    pack.orders[0].created_at,
  );
  const days = computeOffsetDays(maxIso, now);
  if (days === 0) return pack;
  return {
    ...pack,
    orders: pack.orders.map((o) => ({
      ...o,
      created_at: shiftIso(o.created_at, days),
      service_date: o.service_date ? shiftDayKey(o.service_date, days) : o.service_date,
    })),
    payments: pack.payments.map((p) => ({ ...p, created_at: shiftIso(p.created_at, days) })),
    offers: pack.offers.map((f) => ({
      ...f,
      starts_at: shiftNullableIso(f.starts_at, days),
      ends_at: shiftNullableIso(f.ends_at, days),
    })),
    staff: pack.staff.map((s) => ({ ...s, created_at: shiftIso(s.created_at, days) })),
    serviceJobs: pack.serviceJobs.map((j) => ({ ...j, scheduledAt: shiftNullableIso(j.scheduledAt, days) })),
    appointments: pack.appointments.map((a) => ({
      ...a, startsAt: shiftIso(a.startsAt, days), endsAt: shiftIso(a.endsAt, days),
    })),
    visits: pack.visits.map((v) => ({
      ...v,
      checkInAt: shiftNullableIso(v.checkInAt, days),
      checkOutAt: shiftNullableIso(v.checkOutAt, days),
    })),
    tasks: pack.tasks.map((t) => ({ ...t, dueAt: shiftNullableIso(t.dueAt, days) })),
    shifts: pack.shifts.map((s) => ({ ...s, date: shiftDayKey(s.date, days) })),
  };
}
```

Note: string comparison for maxIso works because all timestamps are ISO-8601 UTC. `shiftNullableIso` returns `string | null`; for fields typed `string | null | undefined` (service_date, scheduledAt, dueAt) the ternary preserves the original null/undefined — adjust the two call sites to `o.service_date == null ? o.service_date : shiftDayKey(...)` style if TS flags undefined. Verify against the actual types in `src/types/*.ts` and keep the exact nullability.

- [ ] **Step 4: Run tests — PASS.**
- [ ] **Step 5: Gates + commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
git add src/lib/demo/csv/rebase.ts src/lib/demo/csv/rebase.test.ts
git commit -m "feat: load-time date rebase keeps frozen demo history fresh"
```

---

### Task 4: One-time CSV export (freeze the dataset)

**Files:**
- Create: `src/lib/demo/brands/csv-export.test.ts` (temporary — deleted in Task 5)
- Create: `data/demo/BR-1/*.csv`, `data/demo/BR-2/*.csv` (15 files each)

**Interfaces:**
- Consumes: `BREWERY_CAFE_DEMO`, `CUBIG_FURNITURE_DEMO` (current packs incl. history), `rowsToCsv` from `@/lib/export/csv`.
- Produces: the CSV dataset with header names exactly equal to entity field names (listed below) — consumed by mappers/load-pack (Task 5).

- [ ] **Step 1: Write the dump test**

```ts
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rowsToCsv } from "@/lib/export/csv";
import { BREWERY_CAFE_DEMO } from "./brewery-cafe";
import { CUBIG_FURNITURE_DEMO } from "./cubig-furniture";
import type { DemoBrandPack } from "./types";

const DUMP = process.env.DUMP_DEMO_CSV === "1";
const ROOT = resolve(import.meta.dirname, "../../../..");

type Table = { file: string; headers: string[]; rows: (p: DemoBrandPack) => (string | number | null | undefined)[][] };

const s = (v: string | null | undefined) => v ?? "";
const n = (v: number | null | undefined) => v ?? "";
const b = (v: boolean | null | undefined) => (v == null ? "" : String(v));
const j = (v: unknown) => (v == null ? "" : JSON.stringify(v));

const TABLES: Table[] = [
  { file: "brand.csv", headers: ["id", "code", "name", "order_number_prefix"],
    rows: (p) => [[p.brand.id, p.brand.code, p.brand.name, p.orderNumberPrefix]] },
  { file: "brand_settings.csv",
    headers: ["brand_id", "currency_code", "tax_rate_percent", "receipt_header", "receipt_footer", "contact_email", "contact_phone", "quotation_builder_enabled", "brand_website_url", "block_oversell"],
    rows: (p) => { const x = p.settings; return [[x.brand_id, x.currency_code, n(x.tax_rate_percent), s(x.receipt_header), s(x.receipt_footer), s(x.contact_email), s(x.contact_phone), b(x.quotation_builder_enabled), s(x.brand_website_url), b(x.block_oversell)]]; } },
  { file: "products.csv",
    headers: ["id", "brand_id", "name", "description", "sku", "category", "price", "cost_price", "unit", "is_active", "default_discount_percent", "image_url", "stock_qty", "low_stock_threshold", "wholesale_price", "modifiers_json", "unavailable"],
    rows: (p) => p.products.map((x) => [x.id, x.brand_id, x.name, s(x.description), s(x.sku), s(x.category), x.price, n(x.cost_price), s(x.unit), b(x.is_active), n(x.default_discount_percent), s(x.image_url), n(x.stock_qty), n(x.low_stock_threshold), n(x.wholesale_price), j(x.modifiers_json), b(x.unavailable)]) },
  { file: "customers.csv",
    headers: ["id", "brand_id", "name", "email", "phone", "notes", "price_tier"],
    rows: (p) => p.customers.map((x) => [x.id, x.brand_id, x.name, s(x.email), s(x.phone), s(x.notes), s(x.price_tier)]) },
  { file: "orders.csv",
    headers: ["id", "brand_id", "order_number", "status", "payment_status", "customer_id", "customer_name_snapshot", "subtotal", "discount_total", "tax_total", "fees_total", "grand_total", "notes", "created_at", "table_tag", "delivery_notes", "order_type", "service_date", "guests", "delivery_address", "payment_method", "payment_reference", "deposit_percent", "amount_paid", "offer_code_snapshot", "public_token", "parent_order_id", "order_kind"],
    rows: (p) => p.orders.map((x) => [x.id, x.brand_id, x.order_number, x.status, x.payment_status, s(x.customer_id), s(x.customer_name_snapshot), x.subtotal, x.discount_total, x.tax_total, x.fees_total, x.grand_total, s(x.notes), x.created_at, s(x.table_tag), s(x.delivery_notes), s(x.order_type), s(x.service_date), n(x.guests), s(x.delivery_address), s(x.payment_method), s(x.payment_reference), n(x.deposit_percent), n(x.amount_paid), s(x.offer_code_snapshot), s(x.public_token), s(x.parent_order_id), s(x.order_kind)]) },
  { file: "order_items.csv",
    headers: ["id", "order_id", "product_id", "product_name_snapshot", "quantity", "unit_price", "line_discount", "line_total", "product_image_url_snapshot", "modifier_labels"],
    rows: (p) => p.orderItems.map((x) => [x.id, x.order_id, s(x.product_id), x.product_name_snapshot, x.quantity, x.unit_price, x.line_discount, x.line_total, s(x.product_image_url_snapshot), s(x.modifier_labels)]) },
  { file: "payments.csv",
    headers: ["id", "brand_id", "order_id", "amount", "method", "status", "created_at", "split_label", "notes"],
    rows: (p) => p.payments.map((x) => [x.id, x.brand_id, x.order_id, x.amount, x.method, x.status, x.created_at, s(x.split_label), s(x.notes)]) },
  { file: "offers.csv",
    headers: ["id", "brand_id", "name", "code", "discount_type", "discount_value", "scope", "scope_value", "min_order_amount", "max_discount", "starts_at", "ends_at", "is_active", "redemption_count", "usage_limit"],
    rows: (p) => p.offers.map((x) => [x.id, x.brand_id, x.name, s(x.code), x.discount_type, x.discount_value, x.scope, s(x.scope_value), n(x.min_order_amount), n(x.max_discount), s(x.starts_at), s(x.ends_at), b(x.is_active), x.redemption_count, n(x.usage_limit)]) },
  { file: "staff.csv",
    headers: ["id", "brand_id", "name", "role", "phone", "email", "status", "availability", "created_at"],
    rows: (p) => p.staff.map((x) => [x.id, x.brand_id, x.name, x.role, s(x.phone), s(x.email), x.status, x.availability, x.created_at]) },
  { file: "services.csv",
    headers: ["id", "brand_id", "name", "description", "durationMinutes", "price", "isActive"],
    rows: (p) => p.services.map((x) => [x.id, x.brand_id, x.name, x.description, x.durationMinutes, x.price, b(x.isActive)]) },
  { file: "service_jobs.csv",
    headers: ["id", "brand_id", "serviceId", "customerId", "staff_ids", "status", "scheduledAt", "notes"],
    rows: (p) => p.serviceJobs.map((x) => [x.id, x.brand_id, x.serviceId, x.customerId, j(x.staffIds), x.status, s(x.scheduledAt), x.notes]) },
  { file: "appointments.csv",
    headers: ["id", "brand_id", "title", "customerId", "staff_ids", "startsAt", "endsAt", "location", "serviceId", "status", "notes"],
    rows: (p) => p.appointments.map((x) => [x.id, x.brand_id, x.title, s(x.customerId), j(x.staffIds), x.startsAt, x.endsAt, x.location, s(x.serviceId), x.status, x.notes]) },
  { file: "field_visits.csv",
    headers: ["id", "brand_id", "customerId", "staffId", "purpose", "status", "checkInAt", "checkOutAt", "report"],
    rows: (p) => p.visits.map((x) => [x.id, x.brand_id, x.customerId, x.staffId, x.purpose, x.status, s(x.checkInAt), s(x.checkOutAt), s(x.report)]) },
  { file: "shifts.csv",
    headers: ["id", "brand_id", "staffId", "date", "start", "end", "note"],
    rows: (p) => p.shifts.map((x) => [x.id, x.brand_id, x.staffId, x.date, x.start, x.end, x.note]) },
  { file: "tasks.csv",
    headers: ["id", "brand_id", "title", "description", "assigneeStaffId", "customerId", "priority", "dueAt", "status"],
    rows: (p) => p.tasks.map((x) => [x.id, x.brand_id, x.title, x.description, s(x.assigneeStaffId), s(x.customerId), x.priority, s(x.dueAt), x.status]) },
];

const PACKS: Record<string, DemoBrandPack> = { "BR-1": BREWERY_CAFE_DEMO, "BR-2": CUBIG_FURNITURE_DEMO };

describe("demo CSV dataset", () => {
  for (const [code, pack] of Object.entries(PACKS)) {
    const dir = resolve(ROOT, "data/demo", code);
    if (DUMP) {
      it(`dumps ${code}`, () => {
        mkdirSync(dir, { recursive: true });
        for (const t of TABLES) writeFileSync(resolve(dir, t.file), rowsToCsv(t.headers, t.rows(pack)) + "\n");
        expect(TABLES.length).toBe(15);
      });
    } else {
      it(`${code} CSVs exist and match the pack row counts`, () => {
        for (const t of TABLES) {
          const path = resolve(dir, t.file);
          expect(existsSync(path), `${path} missing — run DUMP_DEMO_CSV=1`).toBe(true);
          const lines = readFileSync(path, "utf8").trim().split("\n");
          expect(lines.length - 1).toBe(t.rows(pack).length);
        }
      });
    }
  }
});
```

IMPORTANT: before running, open `src/types/operations.ts` and `src/types/manager.ts` and verify the exact field names for Shift, Task, FieldVisit, ServiceJob, Appointment, StaffMember (e.g. `report`, `note`, `assigneeStaffId`). If any differ from the headers above, fix BOTH the export headers here and remember the corrected names for Task 5 mappers. The headers must equal the type field names, except `staffIds` which is stored as `staff_ids` (JSON).

- [ ] **Step 2: Run the dump**

Run: `DUMP_DEMO_CSV=1 npx vitest run src/lib/demo/brands/csv-export.test.ts` — PASS, creates 30 files.

- [ ] **Step 3: Verify the freeze**

Run: `npx vitest run src/lib/demo/brands/csv-export.test.ts` (no env) — PASS (row counts match).
Spot-check: `head -3 data/demo/BR-1/products.csv` shows SKU image paths from Task 1; `wc -l data/demo/BR-1/orders.csv` ≈ 175+ rows; grep an order_items row for `/demo/products/BR-1/` snapshots.

- [ ] **Step 4: Commit**

```bash
git add data/demo src/lib/demo/brands/csv-export.test.ts
git commit -m "feat: freeze demo dataset (incl. 6-month history) into repo CSVs"
```

---

### Task 5: CSV loader + pack swap + dead-code deletion

**Files:**
- Create: `src/lib/demo/csv/mappers.ts`, `src/lib/demo/csv/mappers.test.ts`, `src/lib/demo/csv/load-pack.ts`, `src/types/csv.d.ts`
- Modify: `next.config.ts` (raw CSV rule), `vitest.config.mts` (CSV raw plugin), `src/lib/demo/brands/index.ts` (loader-backed), `src/lib/demo/brands/types.ts` (drop analytics), `src/lib/analytics/snapshot.ts` (drop snapshotFromDemo), `src/lib/demo/data.ts` (drop getDemoAnalytics)
- Delete: `src/lib/demo/brands/brewery-cafe.ts`, `cubig-furniture.ts`, `history.ts`, `history.test.ts`, `seed-sql.test.ts`, `csv-export.test.ts`, `brewery-cafe.test.ts`, `src/lib/demo/fixtures.ts`, `src/lib/demo/product-image-urls.ts`
- Create: `src/lib/demo/brands/csv-pack.test.ts` (replacement integrity tests)

**Interfaces:**
- Consumes: parse-csv + rebase (Tasks 2–3), CSV dataset (Task 4).
- Produces: `loadDemoBrandPack(code: DemoBrandCode): DemoBrandPack` (sync, cached); `getDemoBrandPack` keeps its exact existing signature — ALL downstream consumers unchanged.

- [ ] **Step 1: Raw-import plumbing**

`next.config.ts` — add to `turbopack.rules` (verified against `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`, "Module types": `raw` exports file contents as string):

```ts
rules: {
  "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
  "*.csv": { type: "raw" },
},
```

`src/types/csv.d.ts`:

```ts
declare module "*.csv" {
  const content: string;
  export default content;
}
```

`vitest.config.mts` — full replacement:

```ts
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "csv-raw",
      load(id) {
        const path = id.split("?")[0];
        if (path.endsWith(".csv")) {
          return `export default ${JSON.stringify(readFileSync(path, "utf8"))};`;
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write mapper failing tests**

`src/lib/demo/csv/mappers.test.ts` — cover one representative row per entity family (full code):

```ts
import { describe, expect, it } from "vitest";
import { mapProduct, mapOrder, mapOrderItem, mapPayment, mapStaff, mapShift, mapServiceJob, mapBrand } from "./mappers";

const src = "test.csv";

describe("mappers", () => {
  it("mapBrand reads prefix", () => {
    expect(mapBrand({ id: "b", code: "BR-1", name: "Cafe", order_number_prefix: "BC" }, src))
      .toEqual({ brand: { id: "b", code: "BR-1", name: "Cafe" }, orderNumberPrefix: "BC" });
  });
  it("mapProduct coerces numbers, booleans, nulls, JSON", () => {
    const p = mapProduct({
      id: "p1", brand_id: "b", name: "Flat White", description: "", sku: "BV-CF-001",
      category: "Coffee", price: "220", cost_price: "55", unit: "cup", is_active: "true",
      default_discount_percent: "", image_url: "/demo/products/BR-1/BV-CF-001.jpg",
      stock_qty: "", low_stock_threshold: "", wholesale_price: "",
      modifiers_json: '[{"id":"m1","name":"Oat milk","price":40}]', unavailable: "",
    }, src);
    expect(p.price).toBe(220);
    expect(p.description).toBeNull();
    expect(p.is_active).toBe(true);
    expect(p.default_discount_percent).toBeNull();
    expect(p.modifiers_json).toEqual([{ id: "m1", name: "Oat milk", price: 40 }]);
    expect(p.unavailable).toBeUndefined();
  });
  it("mapOrder keeps lifecycle fields and nulls", () => {
    const o = mapOrder({
      id: "o1", brand_id: "b", order_number: "BC-1", status: "completed", payment_status: "paid",
      customer_id: "", customer_name_snapshot: "Walk-in", subtotal: "100", discount_total: "0",
      tax_total: "5", fees_total: "0", grand_total: "105", notes: "", created_at: "2026-11-01T09:00:00.000Z",
      table_tag: "", delivery_notes: "", order_type: "dine_in", service_date: "2026-11-01",
      guests: "2", delivery_address: "", payment_method: "UPI", payment_reference: "",
      deposit_percent: "", amount_paid: "105", offer_code_snapshot: "", public_token: "",
      parent_order_id: "", order_kind: "sale",
    }, src);
    expect(o.customer_id).toBeNull();
    expect(o.guests).toBe(2);
    expect(o.order_type).toBe("dine_in");
    expect(o.grand_total).toBe(105);
  });
  it("mapOrderItem, mapPayment, mapStaff, mapShift, mapServiceJob basics", () => {
    expect(mapOrderItem({ id: "oi1", order_id: "o1", product_id: "p1", product_name_snapshot: "X", quantity: "2", unit_price: "10", line_discount: "0", line_total: "20", product_image_url_snapshot: "", modifier_labels: "" }, src).quantity).toBe(2);
    expect(mapPayment({ id: "pay1", brand_id: "b", order_id: "o1", amount: "105", method: "UPI", status: "paid", created_at: "2026-11-01T09:00:00.000Z", split_label: "", notes: "" }, src).amount).toBe(105);
    expect(mapStaff({ id: "s1", brand_id: "b", name: "Asha", role: "manager", phone: "", email: "", status: "active", availability: "available", created_at: "2026-10-01T09:00:00.000Z" }, src).phone).toBeNull();
    expect(mapShift({ id: "sh1", brand_id: "b", staffId: "s1", date: "2026-11-11", start: "08:00", end: "16:00", note: "Bar" }, src).date).toBe("2026-11-11");
    expect(mapServiceJob({ id: "j1", brand_id: "b", serviceId: "svc1", customerId: "c1", staff_ids: '["s1","s2"]', status: "scheduled", scheduledAt: "", notes: "" }, src).staffIds).toEqual(["s1", "s2"]);
  });
});
```

Run: `npx vitest run src/lib/demo/csv/mappers.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement `mappers.ts`**

One function per table, using Task 2 helpers. Pattern (write ALL 15; signatures fixed):

```ts
import type { Brand, BrandSettings, Customer, Offer, Order, OrderItem, Payment, Product, ProductModifier } from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";
import { bool, json, num, reqNum, reqStr, str, type CsvRow } from "./parse-csv";

export function mapBrand(r: CsvRow, source: string): { brand: Brand; orderNumberPrefix: string } {
  return {
    brand: { id: reqStr(r.id, "id", source), code: reqStr(r.code, "code", source), name: reqStr(r.name, "name", source) },
    orderNumberPrefix: reqStr(r.order_number_prefix, "order_number_prefix", source),
  };
}

export function mapProduct(r: CsvRow, source: string): Product {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: str(r.description),
    sku: str(r.sku),
    category: str(r.category),
    price: reqNum(r.price, "price", source),
    cost_price: num(r.cost_price, "cost_price", source),
    unit: str(r.unit),
    is_active: bool(r.is_active),
    default_discount_percent: num(r.default_discount_percent, "default_discount_percent", source),
    image_url: str(r.image_url),
    stock_qty: num(r.stock_qty, "stock_qty", source),
    low_stock_threshold: num(r.low_stock_threshold, "low_stock_threshold", source),
    wholesale_price: num(r.wholesale_price, "wholesale_price", source),
    modifiers_json: json<ProductModifier[]>(r.modifiers_json),
    unavailable: r.unavailable === "" ? undefined : bool(r.unavailable),
  };
}
export function mapBrandSettings(r: CsvRow, source: string): BrandSettings {
  return {
    brand_id: reqStr(r.brand_id, "brand_id", source),
    currency_code: reqStr(r.currency_code, "currency_code", source),
    tax_rate_percent: num(r.tax_rate_percent, "tax_rate_percent", source) ?? undefined,
    receipt_header: str(r.receipt_header),
    receipt_footer: str(r.receipt_footer),
    contact_email: str(r.contact_email),
    contact_phone: str(r.contact_phone),
    quotation_builder_enabled: r.quotation_builder_enabled === "" ? undefined : bool(r.quotation_builder_enabled),
    brand_website_url: str(r.brand_website_url),
    block_oversell: r.block_oversell === "" ? undefined : bool(r.block_oversell),
  };
}

export function mapCustomer(r: CsvRow, source: string): Customer {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    email: str(r.email),
    phone: str(r.phone),
    notes: str(r.notes),
    price_tier: r.price_tier === "" ? null : (r.price_tier as Customer["price_tier"]),
  };
}

export function mapOrder(r: CsvRow, source: string): Order {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    order_number: reqStr(r.order_number, "order_number", source),
    status: reqStr(r.status, "status", source) as Order["status"],
    payment_status: reqStr(r.payment_status, "payment_status", source) as Order["payment_status"],
    customer_id: str(r.customer_id),
    customer_name_snapshot: str(r.customer_name_snapshot),
    subtotal: reqNum(r.subtotal, "subtotal", source),
    discount_total: reqNum(r.discount_total, "discount_total", source),
    tax_total: reqNum(r.tax_total, "tax_total", source),
    fees_total: reqNum(r.fees_total, "fees_total", source),
    grand_total: reqNum(r.grand_total, "grand_total", source),
    notes: str(r.notes),
    created_at: reqStr(r.created_at, "created_at", source),
    table_tag: str(r.table_tag),
    delivery_notes: str(r.delivery_notes),
    order_type: r.order_type === "" ? null : (r.order_type as Order["order_type"]),
    service_date: str(r.service_date),
    guests: num(r.guests, "guests", source),
    delivery_address: str(r.delivery_address),
    payment_method: str(r.payment_method),
    payment_reference: str(r.payment_reference),
    deposit_percent: num(r.deposit_percent, "deposit_percent", source),
    amount_paid: num(r.amount_paid, "amount_paid", source),
    offer_code_snapshot: str(r.offer_code_snapshot),
    public_token: str(r.public_token),
    parent_order_id: str(r.parent_order_id),
    order_kind: r.order_kind === "" ? null : (r.order_kind as Order["order_kind"]),
  };
}

export function mapOrderItem(r: CsvRow, source: string): OrderItem {
  return {
    id: reqStr(r.id, "id", source),
    order_id: reqStr(r.order_id, "order_id", source),
    product_id: str(r.product_id),
    product_name_snapshot: reqStr(r.product_name_snapshot, "product_name_snapshot", source),
    quantity: reqNum(r.quantity, "quantity", source),
    unit_price: reqNum(r.unit_price, "unit_price", source),
    line_discount: reqNum(r.line_discount, "line_discount", source),
    line_total: reqNum(r.line_total, "line_total", source),
    product_image_url_snapshot: str(r.product_image_url_snapshot),
    modifier_labels: str(r.modifier_labels),
  };
}

export function mapPayment(r: CsvRow, source: string): Payment {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    order_id: reqStr(r.order_id, "order_id", source),
    amount: reqNum(r.amount, "amount", source),
    method: reqStr(r.method, "method", source),
    status: reqStr(r.status, "status", source) as Payment["status"],
    created_at: reqStr(r.created_at, "created_at", source),
    split_label: str(r.split_label),
    notes: str(r.notes),
  };
}

export function mapOffer(r: CsvRow, source: string): Offer {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    code: str(r.code),
    discount_type: reqStr(r.discount_type, "discount_type", source) as Offer["discount_type"],
    discount_value: reqNum(r.discount_value, "discount_value", source),
    scope: reqStr(r.scope, "scope", source) as Offer["scope"],
    scope_value: str(r.scope_value),
    min_order_amount: num(r.min_order_amount, "min_order_amount", source),
    max_discount: num(r.max_discount, "max_discount", source),
    starts_at: str(r.starts_at),
    ends_at: str(r.ends_at),
    is_active: bool(r.is_active),
    redemption_count: reqNum(r.redemption_count, "redemption_count", source),
    usage_limit: num(r.usage_limit, "usage_limit", source),
  };
}

export function mapStaff(r: CsvRow, source: string): StaffMember {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    role: reqStr(r.role, "role", source) as StaffMember["role"],
    phone: str(r.phone),
    email: str(r.email),
    status: reqStr(r.status, "status", source) as StaffMember["status"],
    availability: reqStr(r.availability, "availability", source) as StaffMember["availability"],
    created_at: reqStr(r.created_at, "created_at", source),
  };
}

export function mapService(r: CsvRow, source: string): Service {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: reqStr(r.description, "description", source),
    durationMinutes: reqNum(r.durationMinutes, "durationMinutes", source),
    price: reqNum(r.price, "price", source),
    isActive: bool(r.isActive),
  };
}

export function mapServiceJob(r: CsvRow, source: string): ServiceJob {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    serviceId: reqStr(r.serviceId, "serviceId", source),
    customerId: reqStr(r.customerId, "customerId", source),
    staffIds: json<string[]>(r.staff_ids) ?? [],
    status: reqStr(r.status, "status", source) as ServiceJob["status"],
    scheduledAt: str(r.scheduledAt),
    notes: reqStr(r.notes, "notes", source),
  };
}

export function mapAppointment(r: CsvRow, source: string): Appointment {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    title: reqStr(r.title, "title", source),
    customerId: str(r.customerId),
    staffIds: json<string[]>(r.staff_ids) ?? [],
    startsAt: reqStr(r.startsAt, "startsAt", source),
    endsAt: reqStr(r.endsAt, "endsAt", source),
    location: reqStr(r.location, "location", source),
    serviceId: str(r.serviceId),
    status: reqStr(r.status, "status", source) as Appointment["status"],
    notes: reqStr(r.notes, "notes", source),
  };
}

export function mapFieldVisit(r: CsvRow, source: string): FieldVisit {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customerId: reqStr(r.customerId, "customerId", source),
    staffId: reqStr(r.staffId, "staffId", source),
    purpose: reqStr(r.purpose, "purpose", source),
    status: reqStr(r.status, "status", source) as FieldVisit["status"],
    checkInAt: str(r.checkInAt),
    checkOutAt: str(r.checkOutAt),
    report: str(r.report),
  };
}

export function mapShift(r: CsvRow, source: string): Shift {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    staffId: reqStr(r.staffId, "staffId", source),
    date: reqStr(r.date, "date", source),
    start: reqStr(r.start, "start", source),
    end: reqStr(r.end, "end", source),
    note: reqStr(r.note, "note", source),
  };
}

export function mapTask(r: CsvRow, source: string): Task {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    title: reqStr(r.title, "title", source),
    description: reqStr(r.description, "description", source),
    assigneeStaffId: str(r.assigneeStaffId),
    customerId: str(r.customerId),
    priority: reqStr(r.priority, "priority", source) as Task["priority"],
    dueAt: str(r.dueAt),
    status: reqStr(r.status, "status", source) as Task["status"],
  };
}
```

Field names above mirror the Task 4 export headers exactly; before implementing, cross-check `src/types/operations.ts` / `manager.ts` (e.g. `FieldVisit.report`, `Shift.note`, `Task.dueAt` nullability) and adjust only if the types differ.

- [ ] **Step 4: Implement `load-pack.ts`**

```ts
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { parseCsvObjects } from "./parse-csv";
import { rebasePackDates } from "./rebase";
import {
  mapBrand, mapBrandSettings, mapProduct, mapCustomer, mapOrder, mapOrderItem,
  mapPayment, mapOffer, mapStaff, mapService, mapServiceJob, mapAppointment,
  mapFieldVisit, mapShift, mapTask,
} from "./mappers";

import b1Brand from "../../../../data/demo/BR-1/brand.csv";
import b1Settings from "../../../../data/demo/BR-1/brand_settings.csv";
import b1Products from "../../../../data/demo/BR-1/products.csv";
import b1Customers from "../../../../data/demo/BR-1/customers.csv";
import b1Orders from "../../../../data/demo/BR-1/orders.csv";
import b1Items from "../../../../data/demo/BR-1/order_items.csv";
import b1Payments from "../../../../data/demo/BR-1/payments.csv";
import b1Offers from "../../../../data/demo/BR-1/offers.csv";
import b1Staff from "../../../../data/demo/BR-1/staff.csv";
import b1Services from "../../../../data/demo/BR-1/services.csv";
import b1Jobs from "../../../../data/demo/BR-1/service_jobs.csv";
import b1Appointments from "../../../../data/demo/BR-1/appointments.csv";
import b1Visits from "../../../../data/demo/BR-1/field_visits.csv";
import b1Shifts from "../../../../data/demo/BR-1/shifts.csv";
import b1Tasks from "../../../../data/demo/BR-1/tasks.csv";
import b2Brand from "../../../../data/demo/BR-2/brand.csv";
import b2Settings from "../../../../data/demo/BR-2/brand_settings.csv";
import b2Products from "../../../../data/demo/BR-2/products.csv";
import b2Customers from "../../../../data/demo/BR-2/customers.csv";
import b2Orders from "../../../../data/demo/BR-2/orders.csv";
import b2Items from "../../../../data/demo/BR-2/order_items.csv";
import b2Payments from "../../../../data/demo/BR-2/payments.csv";
import b2Offers from "../../../../data/demo/BR-2/offers.csv";
import b2Staff from "../../../../data/demo/BR-2/staff.csv";
import b2Services from "../../../../data/demo/BR-2/services.csv";
import b2Jobs from "../../../../data/demo/BR-2/service_jobs.csv";
import b2Appointments from "../../../../data/demo/BR-2/appointments.csv";
import b2Visits from "../../../../data/demo/BR-2/field_visits.csv";
import b2Shifts from "../../../../data/demo/BR-2/shifts.csv";
import b2Tasks from "../../../../data/demo/BR-2/tasks.csv";

type BrandCsvFiles = { brand: string; settings: string; products: string; customers: string; orders: string; items: string; payments: string; offers: string; staff: string; services: string; jobs: string; appointments: string; visits: string; shifts: string; tasks: string };

const FILES: Record<DemoBrandCode, BrandCsvFiles> = {
  "BR-1": { brand: b1Brand, settings: b1Settings, products: b1Products, customers: b1Customers, orders: b1Orders, items: b1Items, payments: b1Payments, offers: b1Offers, staff: b1Staff, services: b1Services, jobs: b1Jobs, appointments: b1Appointments, visits: b1Visits, shifts: b1Shifts, tasks: b1Tasks },
  "BR-2": { brand: b2Brand, settings: b2Settings, products: b2Products, customers: b2Customers, orders: b2Orders, items: b2Items, payments: b2Payments, offers: b2Offers, staff: b2Staff, services: b2Services, jobs: b2Jobs, appointments: b2Appointments, visits: b2Visits, shifts: b2Shifts, tasks: b2Tasks },
};

const cache = new Map<DemoBrandCode, DemoBrandPack>();

export function loadDemoBrandPack(code: DemoBrandCode): DemoBrandPack {
  const hit = cache.get(code);
  if (hit) return hit;
  const f = FILES[code];
  const rows = (text: string, name: string) => parseCsvObjects(text, `${code}/${name}`);
  const { brand, orderNumberPrefix } = mapBrand(rows(f.brand, "brand.csv")[0], `${code}/brand.csv`);
  const pack: DemoBrandPack = {
    brand,
    orderNumberPrefix,
    settings: mapBrandSettings(rows(f.settings, "brand_settings.csv")[0], `${code}/brand_settings.csv`),
    products: rows(f.products, "products.csv").map((r) => mapProduct(r, `${code}/products.csv`)),
    customers: rows(f.customers, "customers.csv").map((r) => mapCustomer(r, `${code}/customers.csv`)),
    orders: rows(f.orders, "orders.csv").map((r) => mapOrder(r, `${code}/orders.csv`)),
    orderItems: rows(f.items, "order_items.csv").map((r) => mapOrderItem(r, `${code}/order_items.csv`)),
    payments: rows(f.payments, "payments.csv").map((r) => mapPayment(r, `${code}/payments.csv`)),
    offers: rows(f.offers, "offers.csv").map((r) => mapOffer(r, `${code}/offers.csv`)),
    staff: rows(f.staff, "staff.csv").map((r) => mapStaff(r, `${code}/staff.csv`)),
    services: rows(f.services, "services.csv").map((r) => mapService(r, `${code}/services.csv`)),
    serviceJobs: rows(f.jobs, "service_jobs.csv").map((r) => mapServiceJob(r, `${code}/service_jobs.csv`)),
    appointments: rows(f.appointments, "appointments.csv").map((r) => mapAppointment(r, `${code}/appointments.csv`)),
    visits: rows(f.visits, "field_visits.csv").map((r) => mapFieldVisit(r, `${code}/field_visits.csv`)),
    shifts: rows(f.shifts, "shifts.csv").map((r) => mapShift(r, `${code}/shifts.csv`)),
    tasks: rows(f.tasks, "tasks.csv").map((r) => mapTask(r, `${code}/tasks.csv`)),
  };
  const rebased = rebasePackDates(pack);
  cache.set(code, rebased);
  return rebased;
}
```

(Write the BR-2 imports and FILES entry out in full — no ellipses in the actual file.)

- [ ] **Step 5: Swap `brands/index.ts` and drop dead analytics**

`src/lib/demo/brands/index.ts` — full replacement:

```ts
import { loadDemoBrandPack } from "@/lib/demo/csv/load-pack";
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import { DEFAULT_DEMO_BRAND_CODE, DEMO_BRAND_CODES, type DemoBrandCode } from "@/lib/workspace/constants";

export function getDemoBrandPack(code: DemoBrandCode): DemoBrandPack {
  return loadDemoBrandPack(code);
}

export function resolveDemoBrandCode(value: string | null | undefined): DemoBrandCode {
  if (!value) return DEFAULT_DEMO_BRAND_CODE;
  const normalized = value.trim().toUpperCase();
  if (normalized === "1") return "BR-1";
  if ((DEMO_BRAND_CODES as readonly string[]).includes(normalized)) return normalized as DemoBrandCode;
  return DEFAULT_DEMO_BRAND_CODE;
}
```

(Verify `DEMO_BRAND_CODES` exists in constants — it does, quote-actions imports it. Keep the old `"BR-2"` behavior identical.)

`types.ts`: delete the `DemoAnalytics` type and the `analytics: DemoAnalytics;` field from `DemoBrandPack`.
`snapshot.ts`: delete `snapshotFromDemo` and its `DemoAnalytics` import (no consumers — verified).
`data.ts`: delete `getDemoAnalytics` (no consumers — verified).

- [ ] **Step 6: Delete superseded files, add integrity tests**

Delete: `brands/brewery-cafe.ts`, `brands/cubig-furniture.ts`, `brands/history.ts`, `brands/history.test.ts`, `brands/seed-sql.test.ts`, `brands/csv-export.test.ts`, `brands/brewery-cafe.test.ts`, `src/lib/demo/fixtures.ts`, `src/lib/demo/product-image-urls.ts`.

First grep for any remaining importers of the deleted modules (`grep -rn "product-image-urls\|demo/fixtures\|brands/history\|brands/brewery-cafe\|brands/cubig-furniture\|BREWERY_CAFE_DEMO\|CUBIG_FURNITURE_DEMO\|DEMO_ANALYTICS\|getDemoAnalytics\|snapshotFromDemo" src`) and fix each hit (expected: none beyond the deleted files).

Create `src/lib/demo/brands/csv-pack.test.ts` — replaces the old realism tests, now against the loaded CSV packs:

```ts
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./index";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("CSV demo packs", () => {
  for (const code of ["BR-1", "BR-2"] as const) {
    const pack = getDemoBrandPack(code);
    it(`${code}: referential integrity`, () => {
      const orderIds = new Set(pack.orders.map((o) => o.id));
      const productIds = new Set(pack.products.map((p) => p.id));
      const customerIds = new Set(pack.customers.map((c) => c.id));
      for (const item of pack.orderItems) {
        expect(orderIds.has(item.order_id)).toBe(true);
        if (item.product_id) expect(productIds.has(item.product_id)).toBe(true);
      }
      for (const pay of pack.payments) expect(orderIds.has(pay.order_id)).toBe(true);
      for (const o of pack.orders) if (o.customer_id) expect(customerIds.has(o.customer_id)).toBe(true);
    });
    it(`${code}: unique SKUs and existing image files`, () => {
      const skus = pack.products.map((p) => p.sku).filter(Boolean);
      expect(new Set(skus).size).toBe(skus.length);
      for (const p of pack.products) {
        if (!p.image_url) continue;
        expect(p.image_url.startsWith(`/demo/products/${code}/`)).toBe(true);
        expect(existsSync(resolve(ROOT, "public", p.image_url.slice(1))), p.image_url).toBe(true);
      }
    });
    it(`${code}: history is rebased so the newest order is today`, () => {
      const max = Math.max(...pack.orders.map((o) => new Date(o.created_at).getTime()));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      expect(max).toBeGreaterThanOrEqual(today.getTime());
      expect(max).toBeLessThan(today.getTime() + 86400000);
    });
  }
  it("BR-1 menu realism (ported from brewery-cafe.test.ts)", () => {
    const pack = getDemoBrandPack("BR-1");
    expect(pack.products.some((p) => p.name === "House IPA")).toBe(false);
    expect(pack.orderItems.some((i) => i.product_name_snapshot === "House IPA")).toBe(false);
    const order = pack.orders.find((o) => o.order_number === "BC-1041");
    expect(order).toBeDefined();
    const lines = pack.orderItems.filter((i) => i.order_id === order!.id);
    expect(lines.map((l) => l.product_name_snapshot).sort()).toEqual(["Mango Smoothie", "Peri Peri Fries"]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(order!.subtotal);
    expect(pack.products.filter((p) => p.category === "Sides & Dips")).toHaveLength(6);
    expect(pack.products.filter((p) => p.category === "Desserts")).toHaveLength(3);
    const pastry = pack.products.find((p) => p.name === "Seasonal Pastry");
    expect(pastry?.default_discount_percent).toBe(50);
  });
});
```

- [ ] **Step 7: Full gates**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`. Fix any test that imported deleted modules (expected candidates: none beyond those already deleted — demo lib tests consume `getDemoBrandPack` and must pass unchanged). ALL tests green.

- [ ] **Step 8: Runtime smoke test**

`npm run dev -- -p 3004` (background), isolated browser: `/demo?brand=BR-1` → dashboard KPIs populated, orders board shows history, billing POS photos load, analytics charts render; same for BR-2. Screenshot /tmp. Stop 3004.

- [ ] **Step 9: Commit**

```bash
git add -A src data next.config.ts vitest.config.mts
git commit -m "feat: CSV-backed demo packs with date rebase; delete TS fixtures and history generator"
```

---

### Task 6: Collapse pages + actions to demo-only

**Files (modify):**
- Pages: `src/app/(workspace)/{quotation,customers,customers/[customerId],payments,products,catalog,dashboard,orders,kitchen,billing,analytics}/page.tsx`, `src/app/quote/[token]/page.tsx`
- Actions: `src/services/{operations-actions,manager-actions,manager-ops-actions,product-actions,quote-actions}.ts`, `src/lib/auth/settings-actions.ts`
- Components: `src/components/billing/billing-workspace.tsx`
- Delete: `src/services/actions.ts` (submitOrderAction — live-only; billing calls submitDemoOrder directly)
- Tests: `src/services/manager-actions.test.ts`, `src/services/manager-ops-actions.test.ts` (adjust mocks)

**Interfaces:**
- Consumes: existing demo functions (`listDemoProducts`, `submitDemoOrder`, `saveDemoProduct`, … signatures unchanged).
- Produces: no page/action imports `@/services/data`, `@/services/order-operations`, `@/services/quotes`, or `loadLiveWorkspace` anymore — enables Task 7 deletion.

**Transformation rule (apply to every listed file):** each already contains `if (ws.mode === "demo") { …demo calls… }` followed by live calls. Keep the demo-branch body as the whole function body; delete the live tail and the now-unused imports (`@/services/data`, `@/services/order-operations`, `acceptQuoteByTokenLive`, `loadLiveWorkspace`, `LIVE_UNAVAILABLE`, `canEditBrandSettings` where it guarded live-only). Keep `loadWorkspaceSession` + the `if (!ws)` guard where present.

- [ ] **Step 1: Pages.** Apply the rule to all 12 pages. Example — `payments/page.tsx` becomes:

```tsx
const ws = await loadWorkspaceSession();
if (!ws) redirect("/login");
const rows = await listDemoPayments(ws.brand.code);
```

(Use the exact demo call already present in each file's demo branch — do not invent new ones. `quote/[token]/page.tsx`: delete `liveMatch`, keep `demoMatch` only. `billing/page.tsx`: remove the `mode=` prop entirely.)

- [ ] **Step 2: Actions.** Apply the rule to the 5 service files + `settings-actions.ts` (read it first; it uses `loadLiveWorkspace` — collapse to its demo path). `manager-actions.ts` / `manager-ops-actions.ts`: delete the `const live = await loadLiveWorkspace(); if (live) {…}` guard blocks and `LIVE_UNAVAILABLE`; keep the demo logic. `quote-actions.ts`: delete the `acceptQuoteByTokenLive` attempt; on no demo match return `{ ok: false, message: "Quote not found or already processed." }`. Delete `src/services/actions.ts`; in `billing-workspace.tsx` remove the `mode` prop, the live branch, and the `submitOrderAction` import — the submit handler always calls `submitDemoOrder(input)`.

- [ ] **Step 3: Fix the two manager test files** — they import/mock `@/lib/auth/actions` (`loadLiveWorkspace`). Remove those mocks/imports; the functions under test no longer call it. Run them: `npx vitest run src/services/manager-actions.test.ts src/services/manager-ops-actions.test.ts`.

- [ ] **Step 4: Verify no live imports remain**

Run: `grep -rn "@/services/data\|@/services/order-operations\|@/services/quotes\|loadLiveWorkspace\|submitOrderAction" src` — expected: only the dead files themselves (`services/data.ts`, `order-operations.ts`, `quotes.ts`, `auth/actions.ts`) and `session.ts`/`login-form.tsx`/`app-shell.tsx`/`settings` (handled in Task 7). Nothing in pages/components.

- [ ] **Step 5: Gates + commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
git add -A src
git commit -m "refactor: pages and actions call demo services directly"
```

---

### Task 7: Supabase core removal + demo-picker login

**Files:**
- Delete: `src/lib/supabase/` (4 files), `src/lib/env.ts`, `src/components/env-config-banner.tsx`, `src/services/data.ts`, `src/services/order-operations.ts`, `src/services/quotes.ts`, `src/lib/auth/actions.ts`, `src/components/auth/login-form.tsx`, `scripts/check-env.mjs`, `scripts/setup-local-env.mjs`, `.env.example`, `.env.local` (worktree copy)
- Create: `src/components/auth/demo-picker.tsx`
- Modify: `src/middleware.ts` (standalone), `src/lib/workspace/session.ts`, `src/lib/auth/demo.ts`, `src/app/login/page.tsx`, `src/app/layout.tsx` (banner removal), `src/components/shell/app-shell.tsx` (logout import), `src/app/(workspace)/settings/page.tsx` (live blocks), `src/lib/security/input.ts` (drop isTrustedSupabaseUrl), `package.json`

**Interfaces:**
- Produces: `logoutAction` from `@/lib/auth/demo`; `WorkspaceSession` single demo variant `{ mode: "demo"; brand; settings; role: "owner"; profile; hiddenManagerModules }` (drop `userEmail`, `member`).

- [ ] **Step 1: Session demo-only.** Rewrite `session.ts`: remove `loadLiveWorkspace` import + live branch; `WorkspaceSession` keeps only the demo variant (retain `mode: "demo"` literal so remaining `ws.mode` reads compile); `loadWorkspaceSession` returns the demo session or null. Keep `mergeBrandSettings` + prefs logic unchanged.

- [ ] **Step 2: Settings page.** Delete the three `ws.mode === "live"` blocks (account email display, live-only sections) — read the file and remove the live conditional content, keeping the demo/settings UI.

- [ ] **Step 3: Auth.** `auth/demo.ts`: remove the `createSupabaseServerClient` import and the `signOut` lines from `enterDemoWorkspace`; add:

```ts
export async function logoutAction() {
  await clearDemoWorkspaceCookie();
  redirect("/login");
}
```

Delete `auth/actions.ts`. Update `app-shell.tsx` to import `logoutAction` from `@/lib/auth/demo`. Grep `lib/auth/actions` — zero hits remain.

- [ ] **Step 4: Demo picker.** Create `src/components/auth/demo-picker.tsx` (client component; visual language matches the old login card: Meteors background, LogoMark spin, WebsiteIn eyebrow, Fraunces heading):

```tsx
"use client";

import { useState } from "react";
import { Coffee, Armchair, ArrowRight } from "lucide-react";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import type { DemoBrandCode } from "@/lib/workspace/constants";

const BRANDS: { code: DemoBrandCode; name: string; tagline: string; Icon: typeof Coffee }[] = [
  { code: "BR-1", name: "Brewery Cafe", tagline: "Coffee bar & kitchen — POS, billing, kitchen board, analytics", Icon: Coffee },
  { code: "BR-2", name: "Cubig Furniture", tagline: "Furniture studio — quotations, deliveries, installations", Icon: Armchair },
];

export function DemoPicker() {
  const [pending, setPending] = useState<DemoBrandCode | null>(null);
  async function enter(code: DemoBrandCode) {
    setPending(code);
    await enterDemoWorkspace(code);
  }
  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-hidden">
      <Meteors count={10} seed={11} />
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 ob-safe-top ob-safe-bottom sm:py-12">
        <div className="ob-card p-6 sm:p-8">
          <LogoMark size={52} spin />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ob-text-muted)]">WebsiteIn</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">OrderBook</h1>
          <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
            Pick a demo business to explore the full workspace — no sign-up needed.
          </p>
          <div className="mt-8 space-y-3">
            {BRANDS.map(({ code, name, tagline, Icon }) => (
              <button
                key={code}
                type="button"
                onClick={() => enter(code)}
                disabled={pending !== null}
                className="ob-card flex w-full items-center gap-4 p-4 text-left transition hover:border-[var(--ob-primary)] disabled:opacity-60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ob-surface-muted)] text-[var(--ob-primary)]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold">{name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ob-text-secondary)]">{tagline}</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-[var(--ob-text-muted)]" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs text-[var(--ob-text-muted)]">
            Demo data resets per browser. Your edits stay on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
```

`src/app/login/page.tsx`: `import { DemoPicker } …; return <DemoPicker />;`. Delete `login-form.tsx`. (Verify lucide-react exports `Armchair` — it does; if the installed version differs, use `Sofa`.)

- [ ] **Step 5: Middleware standalone.** Replace `src/middleware.ts` with the ported logic (no Supabase):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { resolveDemoBrandCode } from "@/lib/demo/brands";
import { applySecurityHeaders } from "@/lib/security/headers";
import { safeInternalPath } from "@/lib/security/input";
import {
  DEMO_WORKSPACE_COOKIE,
  demoPathToAppPath,
  isDemoWorkspaceCookieValue,
  isWorkspacePath,
} from "@/lib/workspace/constants";

const PROBE_PATH = /^\/(\.env|wp-admin|wp-login|xmlrpc|phpmyadmin|admin\.php|\.git)/i;

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (PROBE_PATH.test(path)) {
    return applySecurityHeaders(request, new NextResponse(null, { status: 404 }));
  }
  if (path === "/demo" || path.startsWith("/demo/")) {
    const brandCode = resolveDemoBrandCode(request.nextUrl.searchParams.get("brand") ?? undefined);
    const url = request.nextUrl.clone();
    url.pathname = demoPathToAppPath(path);
    url.search = request.nextUrl.search;
    url.searchParams.delete("brand");
    const res = NextResponse.redirect(url);
    res.cookies.set(DEMO_WORKSPACE_COOKIE, brandCode, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return applySecurityHeaders(request, res);
  }
  const demoCookie = isDemoWorkspaceCookieValue(request.cookies.get(DEMO_WORKSPACE_COOKIE)?.value);
  const isPublic = path === "/login" || path === "/" || path.startsWith("/quote/") || path.startsWith("/api/auth");
  if (!demoCookie && !isPublic && !path.startsWith("/_next") && (isWorkspacePath(path) || path.startsWith("/print"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeInternalPath(path));
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }
  if (demoCookie && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeInternalPath(url.searchParams.get("next"));
    url.search = "";
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }
  return applySecurityHeaders(request, NextResponse.next({ request }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Delete `src/lib/supabase/` entirely.

- [ ] **Step 6: Delete dead modules + env machinery.** Delete `lib/env.ts`, `env-config-banner.tsx` (+ its import/usage in `app/layout.tsx`), `services/data.ts`, `services/order-operations.ts`, `services/quotes.ts`. Remove `isTrustedSupabaseUrl` from `security/input.ts` (only env.ts used it). `package.json`: remove `@supabase/ssr`, `@supabase/supabase-js`, and scripts `setup:env`, `check:env`, `predev`. Delete `scripts/check-env.mjs`, `scripts/setup-local-env.mjs`, `.env.example`, and the worktree `.env.local`. Run `npm install` (updates lockfile).

- [ ] **Step 7: Zero-env verification.**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run` — green.
Run: `grep -rni "supabase" src scripts package.json` — zero hits.
Start `npm run dev -- -p 3004` with NO `.env.local` present — must boot. Isolated browser: `/login` shows picker → click Brewery Cafe → dashboard; logout (app-shell) → back to picker; direct `/orders` without cookie → redirects to `/login`. Screenshot /tmp. Stop 3004.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat!: remove Supabase; demo-picker login; zero-env demo app"
```

---

### Task 8: Repo organization + docs

**Files:**
- Delete: `docs/SUPABASE_EXTENSIONS.sql`, `docs/SUPABASE_RLS_APPLY.sql`, `docs/SUPABASE_RLS_RECOMMENDED.sql`, `docs/SUPABASE_SEED_HISTORY.sql`, `docs/DATABASE_CONTRACT.md`, `docs/SECURITY_AUDIT.md`, `docs/SECURITY_CHECKLIST.md`, `docs/SECURITY_FIXES.md`, `docs/SECURITY_REMAINING_RISKS.md`, `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `vibe_images/`
- Rewrite: `README.md`, `docs/SECURITY.md`

- [ ] **Step 1: Verify SVGs unreferenced** — `grep -rn "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" src` → no hits (pre-verified; re-check). Delete the listed files.

- [ ] **Step 2: Rewrite `README.md`** — cover: OrderBook = demo POS/billing/analytics product by WebsiteIn; two demo brands; quick start `npm install && npm run dev` (no env vars); demo data lives in `data/demo/<brand>/*.csv` (edit rows in any spreadsheet app; images in `public/demo/products/<brand>/<SKU>.jpg`; dates auto-rebase so history always ends today); edits persist per-browser; scripts (`dev`, `build`, `start`, `lint`, `test`); deploy: Vercel (import repo, zero config) and Railway (Dockerfile included); Netlify caveat (custom Next fork, unverified). Keep it under ~120 lines.

- [ ] **Step 3: Rewrite `docs/SECURITY.md`** — short, accurate for the demo-only app: security headers (next.config + middleware), probe-path blocking, httpOnly demo cookie, rate limiting on quote accept, input sanitization helpers, no secrets/env needed, demo edits are client-scoped. Delete Supabase/RLS content. (Historical audit docs removed — git history retains them.)

- [ ] **Step 4: Gates + commit**

```bash
npx tsc --noEmit && npx eslint . && npx vitest run
git add -A
git commit -m "chore: repo cleanup — drop Supabase docs, unused assets; rewrite README/SECURITY"
```

---

### Task 9: Deployment config + production build

**Files:**
- Create: `Dockerfile`, `.dockerignore`

- [ ] **Step 1: Dockerfile** (multi-stage; Railway sets `PORT`; Next reads it):

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

(`npm run start` keeps the repo's `NODE_OPTIONS=--max-http-header-size=65536`.)

- [ ] **Step 2: `.dockerignore`**

```
node_modules
.next
.git
.worktrees
.superpowers
docs
*.tsbuildinfo
.env*
```

- [ ] **Step 3: Clean production build, zero env**

Run: `rm -rf .next && npx next build` — must succeed with no `.env.local`. Then `PORT=3004 npm run start` (background), curl `/` and `/login` → 200, isolated-browser smoke of picker → dashboard, stop server. (Docker is not installed on this machine — Dockerfile is best-effort standard; note this in the final report, do not claim a tested Docker build.)

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: Railway Dockerfile; verify zero-env production build"
```

---

### Task 10: Full E2E verification, merge, push

- [ ] **Step 1: Full gates** — `npx tsc --noEmit && npx eslint . && npx vitest run` (report exact test count).

- [ ] **Step 2: E2E matrix** — dev on 3004, isolated agent-browser, desktop + 375px, BOTH themes (switch via `localStorage.setItem('ob-theme','light'|'dark')` + reload):
  1. Landing `/` renders (hero, features, demos, CTAs).
  2. `/login` picker → BR-1 dashboard (KPIs, charts).
  3. Billing: add items → submit order → appears in Orders; refresh → still there (cookie persistence).
  4. Analytics: range chips, charts populated, figures consistent with orders.
  5. Products: SKU photos render for every product (no placeholder tiles); manager tabs (staff/services/tasks/appointments/schedules/visits) populated.
  6. Notifications bell: seeded feed present.
  7. Logout → picker → BR-2: quotation builder enabled, furniture photos, orders history.
  8. Public quote: create a quote in BR-2 billing, open its `/quote/<token>` link in a fresh context, accept → confirmed.
  9. Direct `/orders` in fresh context → redirect `/login`.
  Screenshots to /tmp. Fix any regression before proceeding.

- [ ] **Step 3: Merge + push (user-authorized)**

```bash
# in the MAIN repo (/Users/jainil/Documents/development/orderbook), after git status confirms clean:
git merge feat/csv-demo-data --no-edit
git push origin main
```

- [ ] **Step 4: Refresh the user's demo.** Kill the agent-started :3003 server (premium worktree) and start `npm run dev -- -p 3003` from the MAIN repo (now contains everything); open `http://localhost:3003/` in the user's Chrome. Stop the 3004 verification server. Never touch :3000.

- [ ] **Step 5: Final report** — what changed, test count, push commit hash, demo URL, note that Docker build was not locally tested (no Docker installed).