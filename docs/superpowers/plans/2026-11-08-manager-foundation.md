# Manager Foundation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Manager section to the workspace sidebar with sub-navigation, per-business module visibility, a Management Overview page, working demo-mode Staff management, and honest empty states for the not-yet-built modules (Services, Appointments, Visits, Schedules, Tasks).

**Architecture:** The sidebar nav model (`src/lib/workspace/nav.ts`) gains optional `children` per item; Manager is the first grouped item. Module visibility is a per-brand cookie pref (same pattern as the quotation-builder pref) surfaced on `WorkspaceSession`. Staff is a new demo-only domain: fixtures in the brand packs + cookie-backed mutable store, following the existing customer/product merge pattern. Live mode gets explicit "not connected yet" empty states — no fake data, no Supabase queries against tables that don't exist.

**Tech Stack:** Next.js App Router (server components + server actions), React 19, TypeScript, Tailwind-style CSS vars (`--ob-*`), lucide-react icons, Vitest (node env, `src/**/*.test.ts` only — no component test runner).

**Spec:** Phase 1 of the expansion plan attached at `/Users/jainil/.qoder/tmp/-Users-jainil-Documents-development-orderbook/attachments/d1770d3b-be7e-4be9-bdb6-f1c5ba86d308/36d69728-b3a5-4d8c-ac4a-651b73278f67.txt`, corrected by the codebase audit at `/tmp/orderbook-plan-gap-analysis.md`. Scope fixed below in Global Constraints; Phase 2+ modules (services, appointments, visits, schedules, tasks functionality) are NOT in this plan.

## Global Constraints

- Tenancy key is `brand_id` (never `business_id`). Demo brand codes: `BR-1` (Brewery Cafe), `BR-2` (Cubig Furniture).
- Live Supabase is non-functional (missing tables/RPCs, schema drift). Do NOT add live Supabase queries for staff or any new table. Live mode shows honest empty states.
- Demos never touch Supabase. All demo persistence goes through the existing httpOnly cookie stores (`src/lib/demo/mutable-store.ts`, `src/lib/workspace/prefs.ts`).
- No demo/degraded wording on delivered client surfaces beyond what already exists; empty states for unbuilt modules say plainly they are not built yet (e.g. "Not built yet — planned for Phase 2."), never fake data.
- Do not delete or alter existing Brewery Cafe / Cubig Furniture fixture data; only ADD staff arrays.
- Follow existing page conventions exactly: async server page, `loadWorkspaceSession()`, `redirect("/login")` when null, `PageShell` wrapper, `searchParams` is a Promise. This Next.js version may differ from training data — before using any API not already used in this repo, check `node_modules/next/dist/docs/` (per AGENTS.md).
- `next dev` rewrites the AGENTS.md block; if it produces an uncommitted AGENTS.md change, commit it with the task's work.
- Touch targets ≥ 44px on customer-facing/mobile surfaces; verify at ~375px width.
- Tests: `npm test` (vitest run). Pure logic only — UI tasks are verified in the browser, not unit tests.
- The user may be live-editing files and running servers: re-read a file immediately before editing it; check ports before starting a dev server (his `:3000` may be `npm start` serving a stale build — use `next dev -p 3001` if 3000 is occupied).
- Commit after every task. Never use `--no-verify`.

## File Structure

**Create:**
- `src/lib/workspace/manager-modules.ts` — module registry + visibility logic (pure)
- `src/lib/workspace/manager-modules.test.ts`
- `src/lib/workspace/nav.test.ts`
- `src/types/manager.ts` — StaffMember domain types
- `src/lib/manager/staff.ts` — validation, merge, summary (pure)
- `src/lib/manager/staff.test.ts`
- `src/lib/demo/staff-data.ts` — demo staff reads (fixture + cookie merge)
- `src/services/manager-actions.ts` — staff server actions (demo-only writes)
- `src/components/manager/manager-subnav.tsx` — horizontal sub-nav tabs
- `src/components/manager/staff-manager.tsx` — staff list + add/edit client UI
- `src/components/settings/manager-modules-setting.tsx` — Features-tab visibility toggles
- `src/app/(workspace)/manager/page.tsx` — Management Overview
- `src/app/(workspace)/manager/staff/page.tsx`
- `src/app/(workspace)/manager/services/page.tsx`
- `src/app/(workspace)/manager/appointments/page.tsx`
- `src/app/(workspace)/manager/visits/page.tsx`
- `src/app/(workspace)/manager/schedules/page.tsx`
- `src/app/(workspace)/manager/tasks/page.tsx`

**Modify:**
- `src/lib/workspace/nav.ts` — grouped nav model
- `src/components/shell/app-shell.tsx` — render groups
- `src/lib/workspace/constants.ts` — `/manager` route prefix
- `src/lib/workspace/prefs.ts` — hidden-modules pref
- `src/lib/workspace/session.ts` — carry `hiddenManagerModules`
- `src/lib/auth/settings-actions.ts` — `setManagerModuleHidden`
- `src/components/workspace/command-palette.tsx` — Manager links
- `src/lib/demo/brands/types.ts` — `staff` on DemoBrandPack
- `src/lib/demo/brands/brewery-cafe.ts`, `src/lib/demo/brands/cubig-furniture.ts` — staff fixtures
- `src/lib/demo/mutable-store.ts` — staff fields on bucket
- `src/app/(workspace)/settings/page.tsx` — mount ManagerModulesSetting in Features tab

---

### Task 1: Manager module registry and visibility logic

**Files:**
- Create: `src/lib/workspace/manager-modules.ts`
- Test: `src/lib/workspace/manager-modules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `MANAGER_MODULES` (readonly array of `{ key, label, href }`), `type ManagerModuleKey`, `isManagerModuleKey(value: string): value is ManagerModuleKey`, `visibleManagerModules(hidden: readonly string[]): ManagerModule[]`, `parseHiddenManagerModules(raw: unknown): ManagerModuleKey[]`. Tasks 2–8 use these exact names.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workspace/manager-modules.test.ts
import { describe, expect, it } from "vitest";
import {
  MANAGER_MODULES,
  isManagerModuleKey,
  parseHiddenManagerModules,
  visibleManagerModules,
} from "@/lib/workspace/manager-modules";

describe("manager modules", () => {
  it("registers the six Phase 1 sub-modules in nav order", () => {
    expect(MANAGER_MODULES.map((m) => m.key)).toEqual([
      "staff",
      "services",
      "appointments",
      "visits",
      "schedules",
      "tasks",
    ]);
    expect(MANAGER_MODULES.every((m) => m.href.startsWith("/manager/"))).toBe(true);
  });

  it("hides only listed modules and keeps order", () => {
    const visible = visibleManagerModules(["visits", "services"]);
    expect(visible.map((m) => m.key)).toEqual([
      "staff",
      "appointments",
      "schedules",
      "tasks",
    ]);
  });

  it("ignores unknown keys in the hidden list", () => {
    expect(visibleManagerModules(["bogus"])).toHaveLength(MANAGER_MODULES.length);
  });

  it("validates module keys", () => {
    expect(isManagerModuleKey("staff")).toBe(true);
    expect(isManagerModuleKey("inventory")).toBe(false);
  });

  it("parses stored prefs defensively", () => {
    expect(parseHiddenManagerModules(["visits", "bogus", 3, null])).toEqual(["visits"]);
    expect(parseHiddenManagerModules(undefined)).toEqual([]);
    expect(parseHiddenManagerModules("visits")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workspace/manager-modules.test.ts`
Expected: FAIL — cannot resolve `@/lib/workspace/manager-modules`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/workspace/manager-modules.ts
export const MANAGER_MODULES = [
  { key: "staff", label: "Staff", href: "/manager/staff" },
  { key: "services", label: "Services", href: "/manager/services" },
  { key: "appointments", label: "Meetings & Appointments", href: "/manager/appointments" },
  { key: "visits", label: "Visits & Field Ops", href: "/manager/visits" },
  { key: "schedules", label: "Schedules", href: "/manager/schedules" },
  { key: "tasks", label: "Tasks & Activities", href: "/manager/tasks" },
] as const;

export type ManagerModule = (typeof MANAGER_MODULES)[number];
export type ManagerModuleKey = ManagerModule["key"];

export function isManagerModuleKey(value: string): value is ManagerModuleKey {
  return MANAGER_MODULES.some((m) => m.key === value);
}

export function visibleManagerModules(hidden: readonly string[]): ManagerModule[] {
  return MANAGER_MODULES.filter((m) => !hidden.includes(m.key));
}

export function parseHiddenManagerModules(raw: unknown): ManagerModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ManagerModuleKey => typeof v === "string" && isManagerModuleKey(v),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/workspace/manager-modules.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace/manager-modules.ts src/lib/workspace/manager-modules.test.ts
git commit -m "feat: add Manager module registry and visibility logic"
```

---

### Task 2: Grouped nav model

**Files:**
- Modify: `src/lib/workspace/nav.ts` (whole file, 68 lines)
- Test: `src/lib/workspace/nav.test.ts`

**Interfaces:**
- Consumes: `visibleManagerModules`, `ManagerModuleKey` from Task 1; existing `WorkspaceProfile` from `src/lib/workspace/constants.ts`.
- Produces: `WorkspaceNavItem` gains optional `children?: { href: string; label: string }[]` and iconKey `"Manager"`. New signature: `buildWorkspaceNavItems(quotationBuilderEnabled: boolean, profile: WorkspaceProfile, hiddenManagerModules?: readonly ManagerModuleKey[]): WorkspaceNavItem[]` (third arg defaults to `[]`, so existing 2-arg call sites keep compiling until Task 4 updates them). Manager item: `{ href: "/manager", label: "Manager", iconKey: "Manager", children: [...] }`, inserted after Products, before Analytics.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/workspace/nav.test.ts
import { describe, expect, it } from "vitest";
import { buildWorkspaceNavItems } from "@/lib/workspace/nav";
import { getWorkspaceProfile } from "@/lib/workspace/constants";

const profile = getWorkspaceProfile("BR-1");

describe("buildWorkspaceNavItems", () => {
  it("keeps existing flat items in order for retail mode", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard",
      "/billing",
      "/orders",
      "/products",
      "/manager",
      "/analytics",
      "/customers",
      "/payments",
      "/settings",
    ]);
  });

  it("keeps split quotation/bill items when enabled", () => {
    const items = buildWorkspaceNavItems(true, getWorkspaceProfile("BR-2"));
    expect(items.map((i) => i.href).slice(0, 4)).toEqual([
      "/dashboard",
      "/quotation",
      "/billing",
      "/orders",
    ]);
    expect(items.find((i) => i.href === "/orders")?.label).toBe("Quotes & bills");
  });

  it("adds Manager with all six children by default", () => {
    const manager = buildWorkspaceNavItems(false, profile).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.iconKey).toBe("Manager");
    expect(manager?.children?.map((c) => c.href)).toEqual([
      "/manager/staff",
      "/manager/services",
      "/manager/appointments",
      "/manager/visits",
      "/manager/schedules",
      "/manager/tasks",
    ]);
  });

  it("drops hidden modules from Manager children", () => {
    const manager = buildWorkspaceNavItems(false, profile, ["visits"]).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.some((c) => c.href === "/manager/visits")).toBe(false);
    expect(manager?.children).toHaveLength(5);
  });

  it("flat items have no children", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.filter((i) => i.href !== "/manager").every((i) => !i.children)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/workspace/nav.test.ts`
Expected: FAIL — `/manager` missing from nav.

- [ ] **Step 3: Rewrite `src/lib/workspace/nav.ts`**

```ts
import type { WorkspaceProfile } from "@/lib/workspace/constants";
import {
  visibleManagerModules,
  type ManagerModuleKey,
} from "@/lib/workspace/manager-modules";

export type WorkspaceNavChild = { href: string; label: string };

export type WorkspaceNavItem = {
  href: string;
  label: string;
  iconKey:
    | "Dashboard"
    | "Billing"
    | "Quotation"
    | "Bill"
    | "Orders"
    | "Products"
    | "Manager"
    | "Analytics"
    | "Customers"
    | "Payments"
    | "Settings";
  children?: WorkspaceNavChild[];
};

export function buildWorkspaceNavItems(
  quotationBuilderEnabled: boolean,
  profile: WorkspaceProfile,
  hiddenManagerModules: readonly ManagerModuleKey[] = [],
): WorkspaceNavItem[] {
  const label = (key: WorkspaceNavItem["iconKey"], fallback: string) =>
    profile.navLabelOverrides[fallback as keyof typeof profile.navLabelOverrides] ??
    fallback;

  const items: WorkspaceNavItem[] = [
    { href: "/dashboard", label: "Dashboard", iconKey: "Dashboard" },
  ];

  if (quotationBuilderEnabled) {
    items.push(
      {
        href: "/quotation",
        label:
          profile.billingPos.quotationCartTitle ??
          label("Quotation", "Quotation"),
        iconKey: "Quotation",
      },
      {
        href: "/billing",
        label: profile.billingPos.billCartTitle ?? profile.billingPageTitle,
        iconKey: "Bill",
      },
    );
  } else {
    items.push({
      href: "/billing",
      label: profile.billingPageTitle,
      iconKey: "Billing",
    });
  }

  items.push(
    {
      href: "/orders",
      label: profile.ordersPageTitle,
      iconKey: "Orders",
    },
    { href: "/products", label: "Products", iconKey: "Products" },
    {
      href: "/manager",
      label: "Manager",
      iconKey: "Manager",
      children: visibleManagerModules(hiddenManagerModules).map((m) => ({
        href: m.href,
        label: m.label,
      })),
    },
    { href: "/analytics", label: "Analytics", iconKey: "Analytics" },
    { href: "/customers", label: "Customers", iconKey: "Customers" },
    { href: "/payments", label: "Payments", iconKey: "Payments" },
    { href: "/settings", label: "Settings", iconKey: "Settings" },
  );

  return items;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/workspace/nav.test.ts`
Expected: PASS (5 tests). Then `npm test` — full suite still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace/nav.ts src/lib/workspace/nav.test.ts
git commit -m "feat: grouped workspace nav with Manager section"
```

---

### Task 3: Hidden-modules pref, session wiring, settings action

**Files:**
- Modify: `src/lib/workspace/prefs.ts`
- Modify: `src/lib/workspace/session.ts`
- Modify: `src/lib/auth/settings-actions.ts`

**Interfaces:**
- Consumes: `parseHiddenManagerModules`, `isManagerModuleKey`, `ManagerModuleKey` (Task 1).
- Produces:
  - `readManagerModulesPref(brandCode: string): Promise<ManagerModuleKey[] | undefined>` and `writeManagerModulesPref(brandCode: string, hidden: ManagerModuleKey[]): Promise<void>` in prefs.ts.
  - `WorkspaceSession` (both variants) gains `hiddenManagerModules: ManagerModuleKey[]`.
  - Server action `setManagerModuleHidden(moduleKey: string, hidden: boolean): Promise<{ ok: true } | { ok: false; message: string }>` in settings-actions.ts.

- [ ] **Step 1: Extend `src/lib/workspace/prefs.ts`**

Add `hiddenManagerModules?: string[];` to the `PrefsStore` entry type (after `contactPhone`). Add at the end of the file (import `parseHiddenManagerModules` and `type ManagerModuleKey` from `@/lib/workspace/manager-modules` at the top):

```ts
export async function readManagerModulesPref(
  brandCode: string,
): Promise<ManagerModuleKey[] | undefined> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  const raw = store[brandCode.toUpperCase()]?.hiddenManagerModules;
  return raw === undefined ? undefined : parseHiddenManagerModules(raw);
}

export async function writeManagerModulesPref(
  brandCode: string,
  hidden: ManagerModuleKey[],
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(WORKSPACE_PREFS_COOKIE)?.value);
  store[brandCode.toUpperCase()] = {
    ...store[brandCode.toUpperCase()],
    hiddenManagerModules: hidden,
  };
  cookieStore.set(WORKSPACE_PREFS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
```

- [ ] **Step 2: Wire into `src/lib/workspace/session.ts`**

Add `readManagerModulesPref` to the prefs import. Add `hiddenManagerModules: ManagerModuleKey[];` to BOTH variants of `WorkspaceSession` (import `type ManagerModuleKey` from `@/lib/workspace/manager-modules`). In `loadWorkspaceSession`, for the live branch after `const settings = ...`:

```ts
const hiddenManagerModules =
  (await readManagerModulesPref(live.brand.code)) ?? [];
```

and include `hiddenManagerModules` in the returned object. Same for the demo branch using `meta.brand.code`.

- [ ] **Step 3: Add the server action to `src/lib/auth/settings-actions.ts`**

Import `isManagerModuleKey` from `@/lib/workspace/manager-modules` and `readManagerModulesPref`, `writeManagerModulesPref` from `@/lib/workspace/prefs` (add to existing import). Append:

```ts
export async function setManagerModuleHidden(moduleKey: string, hidden: boolean) {
  if (!isManagerModuleKey(moduleKey)) {
    return { ok: false as const, message: "Unknown module." };
  }

  const live = await loadLiveWorkspace();
  if (live && !canEditBrandSettings(live.member.role)) {
    return { ok: false as const, message: "Not allowed." };
  }

  // No brand_settings column exists for this yet; the cookie pref is the
  // store for both modes until the live schema catches up.
  const brandCode = live
    ? live.brand.code
    : await (async () => {
        const { cookies } = await import("next/headers");
        const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } =
          await import("@/lib/workspace/constants");
        const cookieStore = await cookies();
        return (
          parseDemoBrandCodeFromCookie(
            cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value,
          ) ?? "BR-1"
        );
      })();

  const current = (await readManagerModulesPref(brandCode)) ?? [];
  const next = hidden
    ? Array.from(new Set([...current, moduleKey]))
    : current.filter((k) => k !== moduleKey);
  await writeManagerModulesPref(brandCode, next);
  revalidatePath("/settings");
  revalidatePath("/manager");
  return { ok: true as const };
}
```

- [ ] **Step 4: Verify compile + tests**

Run: `npx tsc --noEmit` and `npm test`.
Expected: no type errors, all tests pass. (AppShell still calls the 2-arg nav builder — valid because of the default parameter.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/workspace/prefs.ts src/lib/workspace/session.ts src/lib/auth/settings-actions.ts
git commit -m "feat: per-brand Manager module visibility pref and session wiring"
```

---

### Task 4: Sidebar group rendering, route guard, command palette

**Files:**
- Modify: `src/components/shell/app-shell.tsx`
- Modify: `src/lib/workspace/constants.ts:24-36` (WORKSPACE_ROUTE_PREFIXES)
- Modify: `src/components/workspace/command-palette.tsx:8-18` (LINKS)

**Interfaces:**
- Consumes: `WorkspaceNavItem.children` (Task 2), `ws.hiddenManagerModules` (Task 3).
- Produces: sidebar renders Manager as an expandable group; `/manager/*` is auth-guarded; palette has Manager entries. No new exported symbols.

- [ ] **Step 1: Add the route prefix**

In `src/lib/workspace/constants.ts`, add `"/manager",` to `WORKSPACE_ROUTE_PREFIXES` (after `"/catalog",`). This makes middleware guard `/manager/*` and the `/demo/manager/...` rewrite work automatically.

- [ ] **Step 2: Update `src/components/shell/app-shell.tsx`**

Add imports: `ClipboardList`, `ChevronDown` to the lucide import. Add to the `icons` map: `Manager: ClipboardList,`.

Change the nav build call to:

```ts
const navItems = buildWorkspaceNavItems(
  Boolean(ws.settings.quotation_builder_enabled),
  profile,
  ws.hiddenManagerModules,
);
```

Add state below the existing `useState` lines:

```ts
const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
```

Replace the `navItems.map(...)` block inside `<nav>` with:

```tsx
{navItems.map((item) => {
  const href = item.href;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = icons[item.iconKey];
  const hasChildren = Boolean(item.children?.length);
  const expanded = hasChildren && (expandedGroups[href] ?? active);
  return (
    <div key={href}>
      <div className="flex items-center">
        <Link
          href={href}
          onClick={() => setMobileOpen(false)}
          data-active={active ? "true" : "false"}
          className={cn(
            "ob-nav-link flex flex-1 items-center gap-3 rounded-[var(--ob-radius-md)] px-3 py-2.5 text-base transition-colors duration-200",
            active
              ? "bg-white/10 font-medium text-white"
              : "text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white",
          )}
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed ? item.label : null}
        </Link>
        {hasChildren && !collapsed ? (
          <button
            type="button"
            className="ob-touch-target grid shrink-0 place-items-center rounded-md px-1 text-[var(--ob-sidebar-muted)] hover:text-white"
            aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={expanded}
            onClick={() =>
              setExpandedGroups((prev) => ({ ...prev, [href]: !expanded }))
            }
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
      {hasChildren && expanded && !collapsed ? (
        <div className="mt-0.5 space-y-0.5 pl-8">
          {item.children!.map((child) => {
            const childActive =
              pathname === child.href || pathname.startsWith(`${child.href}/`);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "block rounded-[var(--ob-radius-md)] px-3 py-2 text-sm transition-colors",
                  childActive
                    ? "bg-white/10 font-medium text-white"
                    : "text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white",
                )}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
})}
```

- [ ] **Step 3: Add palette links**

In `src/components/workspace/command-palette.tsx` LINKS, after the Products entries add:

```ts
{ href: "/manager", label: "Manager overview" },
{ href: "/manager/staff", label: "Staff" },
```

- [ ] **Step 4: Verify in browser**

Run `npx tsc --noEmit`. Check port 3000 (`lsof -i :3000`); if occupied by the user's `npm start`, run `npx next dev -p 3001` (background), else `npm run dev`. Open `http://localhost:<port>/demo?brand=BR-1` in the browser (use a NEW tab — the user shares this Chrome). If the Next.js dev overlay blocks clicks, remove it via evaluate: `document.querySelector('nextjs-portal')?.remove()`. Verify: Manager appears between Products and Analytics; chevron expands/collapses children; navigating to `/manager/staff` (404 for now is fine) auto-expands the group and highlights Manager; collapsed sidebar shows only the clipboard icon; mobile drawer at 375px shows the same. Repeat quickly with `?brand=BR-2`.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/app-shell.tsx src/lib/workspace/constants.ts src/components/workspace/command-palette.tsx
git commit -m "feat: render Manager nav group and guard /manager routes"
```

---

### Task 5: Manager pages scaffold with sub-nav and honest empty states

**Files:**
- Create: `src/components/manager/manager-subnav.tsx`
- Create: `src/app/(workspace)/manager/page.tsx` (placeholder overview, upgraded in Task 8)
- Create: `src/app/(workspace)/manager/{staff,services,appointments,visits,schedules,tasks}/page.tsx`

**Interfaces:**
- Consumes: `MANAGER_MODULES`, `visibleManagerModules` (Task 1); `useWorkspace().hiddenManagerModules` (Task 3); `PageShell`, `EmptyState`.
- Produces: `ManagerSubnav({ activeHref }: { activeHref: string })` client component — horizontal scrollable tabs: Overview (`/manager`) + visible modules. All seven routes exist and redirect hidden modules to `/manager`.

- [ ] **Step 1: Create `src/components/manager/manager-subnav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";

export function ManagerSubnav({ activeHref }: { activeHref: string }) {
  const ws = useWorkspace();
  const tabs = [
    { href: "/manager", label: "Overview" },
    ...visibleManagerModules(ws.hiddenManagerModules),
  ];
  return (
    <div className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-[var(--ob-border)] pb-px">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "ob-touch-target inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm transition-colors",
                active
                  ? "border-[var(--ob-primary)] font-medium text-[var(--ob-text)]"
                  : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the placeholder overview page**

```tsx
// src/app/(workspace)/manager/page.tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      <EmptyState
        title="Management Overview"
        description="Staff availability and operational summaries land here as modules are built."
      />
    </PageShell>
  );
}
```

- [ ] **Step 3: Create the six module pages**

Staff page (real UI arrives in Task 7; placeholder for now):

```tsx
// src/app/(workspace)/manager/staff/page.tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");
  return (
    <PageShell title="Staff">
      <ManagerSubnav activeHref="/manager/staff" />
      <EmptyState title="Staff" description="Employee profiles and availability are being connected." />
    </PageShell>
  );
}
```

For each remaining module, create the same file shape with these substitutions (write each file out fully — do not abbreviate):

| File | Title / EmptyState title | activeHref | hidden key | description |
|---|---|---|---|---|
| `manager/services/page.tsx` | `Services` | `/manager/services` | `services` | `Service catalogue, requests and work orders are not built yet — planned for Phase 2.` |
| `manager/appointments/page.tsx` | `Meetings & Appointments` | `/manager/appointments` | `appointments` | `Booking calendar and appointments are not built yet — planned for Phase 2.` |
| `manager/visits/page.tsx` | `Visits & Field Operations` | `/manager/visits` | `visits` | `Field visits, check-in/out and work reports are not built yet — planned for Phase 2.` |
| `manager/schedules/page.tsx` | `Schedules` | `/manager/schedules` | `schedules` | `Shifts and working-hour calendars are not built yet — planned for Phase 2.` |
| `manager/tasks/page.tsx` | `Tasks & Activities` | `/manager/tasks` | `tasks` | `Task assignment and tracking are not built yet — planned for Phase 2.` |

Each page: `const ws = await loadWorkspaceSession(); if (!ws) redirect("/login"); if (ws.hiddenManagerModules.includes("<key>")) redirect("/manager");` then `PageShell` + `ManagerSubnav` + `EmptyState` exactly like the staff page.

- [ ] **Step 4: Verify in browser**

With the dev server running, visit `/demo?brand=BR-1` → `/manager`. Verify: sub-nav tabs render and scroll horizontally at 375px; each tab navigates and shows its empty state; active tab underline follows. Confirm `/manager/tasks` directly loads (auth guard works via the demo cookie).

- [ ] **Step 5: Commit**

```bash
git add src/components/manager/manager-subnav.tsx "src/app/(workspace)/manager"
git commit -m "feat: Manager section routes with sub-navigation and empty states"
```

---

### Task 6: Staff domain types, fixtures, merge logic

**Files:**
- Create: `src/types/manager.ts`
- Create: `src/lib/manager/staff.ts`
- Test: `src/lib/manager/staff.test.ts`
- Modify: `src/lib/demo/brands/types.ts`
- Modify: `src/lib/demo/brands/brewery-cafe.ts`, `src/lib/demo/brands/cubig-furniture.ts`
- Modify: `src/lib/demo/mutable-store.ts`
- Create: `src/lib/demo/staff-data.ts`

**Interfaces:**
- Consumes: `DemoBrandCode`, `getDemoBrandPack`, `readDemoMutableBucket`.
- Produces (Tasks 7–8 rely on these exact shapes):
  - `type StaffRole = "manager" | "cashier" | "kitchen" | "technician" | "sales" | "other"`
  - `type StaffAvailability = "available" | "busy" | "off"`
  - `type StaffMember = { id: string; brand_id: string; name: string; role: StaffRole; phone: string | null; email: string | null; status: "active" | "inactive"; availability: StaffAvailability; created_at: string }`
  - `type StaffInput = { name: string; role: string; phone?: string; email?: string }`
  - `validateStaffInput(input: StaffInput): { ok: true; value: { name: string; role: StaffRole; phone: string | null; email: string | null } } | { ok: false; message: string }`
  - `mergeStaff(base: StaffMember[], additions: StaffMember[], overrides: Record<string, Partial<StaffMember>>): StaffMember[]` — additions appended after base, overrides applied by id, sorted by name.
  - `staffAvailabilitySummary(staff: StaffMember[]): { active: number; available: number; busy: number; off: number }` — counts only `status === "active"` members.
  - `DemoBrandPack.staff: StaffMember[]`; `DemoMutableBucket.staff: StaffMember[]` and `staffOverrides: Record<string, Partial<StaffMember>>`.
  - `listDemoStaff(brandCode?: DemoBrandCode): Promise<StaffMember[]>` in `src/lib/demo/staff-data.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/manager/staff.test.ts
import { describe, expect, it } from "vitest";
import {
  mergeStaff,
  staffAvailabilitySummary,
  validateStaffInput,
} from "@/lib/manager/staff";
import type { StaffMember } from "@/types/manager";

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "s1",
  brand_id: "demo-brewery-cafe",
  name: "Asha",
  role: "cashier",
  phone: null,
  email: null,
  status: "active",
  availability: "available",
  created_at: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("validateStaffInput", () => {
  it("trims and normalizes a valid input", () => {
    const result = validateStaffInput({
      name: "  Asha  ",
      role: "cashier",
      phone: " 9876543210 ",
      email: "",
    });
    expect(result).toEqual({
      ok: true,
      value: { name: "Asha", role: "cashier", phone: "9876543210", email: null },
    });
  });

  it("rejects empty names and unknown roles", () => {
    expect(validateStaffInput({ name: " ", role: "cashier" }).ok).toBe(false);
    expect(validateStaffInput({ name: "Asha", role: "astronaut" }).ok).toBe(false);
  });

  it("caps name length", () => {
    const result = validateStaffInput({ name: "x".repeat(300), role: "other" });
    expect(result.ok && result.value.name.length).toBe(120);
  });
});

describe("mergeStaff", () => {
  it("appends additions, applies overrides, sorts by name", () => {
    const merged = mergeStaff(
      [member()],
      [member({ id: "s2", name: "Balu" })],
      { s1: { availability: "busy" } },
    );
    expect(merged.map((m) => m.name)).toEqual(["Asha", "Balu"]);
    expect(merged[0].availability).toBe("busy");
  });

  it("ignores overrides for unknown ids", () => {
    expect(mergeStaff([member()], [], { ghost: { name: "No" } })).toHaveLength(1);
  });
});

describe("staffAvailabilitySummary", () => {
  it("counts only active staff", () => {
    const summary = staffAvailabilitySummary([
      member(),
      member({ id: "s2", availability: "busy" }),
      member({ id: "s3", availability: "off" }),
      member({ id: "s4", status: "inactive" }),
    ]);
    expect(summary).toEqual({ active: 3, available: 1, busy: 1, off: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/manager/staff.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create types and pure logic**

```ts
// src/types/manager.ts
export type StaffRole =
  | "manager"
  | "cashier"
  | "kitchen"
  | "technician"
  | "sales"
  | "other";

export type StaffAvailability = "available" | "busy" | "off";

export type StaffMember = {
  id: string;
  brand_id: string;
  name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
  availability: StaffAvailability;
  created_at: string;
};
```

```ts
// src/lib/manager/staff.ts
import type { StaffAvailability, StaffMember, StaffRole } from "@/types/manager";

export const STAFF_ROLES: StaffRole[] = [
  "manager",
  "cashier",
  "kitchen",
  "technician",
  "sales",
  "other",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  manager: "Manager",
  cashier: "Cashier",
  kitchen: "Kitchen",
  technician: "Technician",
  sales: "Sales",
  other: "Other",
};

export const STAFF_AVAILABILITY_LABELS: Record<StaffAvailability, string> = {
  available: "Available",
  busy: "Busy",
  off: "Off duty",
};

export type StaffInput = {
  name: string;
  role: string;
  phone?: string;
  email?: string;
};

export function validateStaffInput(
  input: StaffInput,
):
  | { ok: true; value: { name: string; role: StaffRole; phone: string | null; email: string | null } }
  | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "Name is required." };
  if (!STAFF_ROLES.includes(input.role as StaffRole)) {
    return { ok: false, message: "Pick a valid role." };
  }
  return {
    ok: true,
    value: {
      name,
      role: input.role as StaffRole,
      phone: input.phone?.trim().slice(0, 40) || null,
      email: input.email?.trim().slice(0, 120) || null,
    },
  };
}

export function mergeStaff(
  base: StaffMember[],
  additions: StaffMember[],
  overrides: Record<string, Partial<StaffMember>>,
): StaffMember[] {
  const byId = new Map<string, StaffMember>();
  for (const m of [...base, ...additions]) {
    byId.set(m.id, { ...m, ...overrides[m.id] });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function staffAvailabilitySummary(staff: StaffMember[]) {
  const active = staff.filter((m) => m.status === "active");
  return {
    active: active.length,
    available: active.filter((m) => m.availability === "available").length,
    busy: active.filter((m) => m.availability === "busy").length,
    off: active.filter((m) => m.availability === "off").length,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/manager/staff.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Add fixtures and store fields**

In `src/lib/demo/brands/types.ts`: import `type StaffMember` from `@/types/manager` and add `staff: StaffMember[];` to `DemoBrandPack` (after `payments`).

In `src/lib/demo/brands/brewery-cafe.ts`: import `type StaffMember` from `@/types/manager`; add to the exported pack object (after `payments`):

```ts
staff: [
  {
    id: "bc-staff-1",
    brand_id: "demo-brewery-cafe",
    name: "Asha Menon",
    role: "manager",
    phone: "+91 98000 11001",
    email: null,
    status: "active",
    availability: "available",
    created_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "bc-staff-2",
    brand_id: "demo-brewery-cafe",
    name: "Rohan Pillai",
    role: "cashier",
    phone: "+91 98000 11002",
    email: null,
    status: "active",
    availability: "busy",
    created_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "bc-staff-3",
    brand_id: "demo-brewery-cafe",
    name: "Meera Nair",
    role: "kitchen",
    phone: null,
    email: null,
    status: "active",
    availability: "available",
    created_at: "2026-10-05T09:00:00.000Z",
  },
  {
    id: "bc-staff-4",
    brand_id: "demo-brewery-cafe",
    name: "Devan Kurup",
    role: "kitchen",
    phone: null,
    email: null,
    status: "active",
    availability: "off",
    created_at: "2026-10-05T09:00:00.000Z",
  },
] satisfies StaffMember[],
```

In `src/lib/demo/brands/cubig-furniture.ts`: same pattern with `brand_id: "demo-cubig-furniture"` (verified: the file's `BRAND_ID` constant), ids `cf-staff-1..4`:

```ts
staff: [
  {
    id: "cf-staff-1",
    brand_id: "demo-cubig-furniture",
    name: "Kiran Shetty",
    role: "manager",
    phone: "+91 98000 22001",
    email: null,
    status: "active",
    availability: "available",
    created_at: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "cf-staff-2",
    brand_id: "demo-cubig-furniture",
    name: "Farhan Ali",
    role: "technician",
    phone: "+91 98000 22002",
    email: null,
    status: "active",
    availability: "busy",
    created_at: "2026-10-02T09:00:00.000Z",
  },
  {
    id: "cf-staff-3",
    brand_id: "demo-cubig-furniture",
    name: "Suresh Rao",
    role: "technician",
    phone: null,
    email: null,
    status: "active",
    availability: "available",
    created_at: "2026-10-02T09:00:00.000Z",
  },
  {
    id: "cf-staff-4",
    brand_id: "demo-cubig-furniture",
    name: "Lakshmi Iyer",
    role: "sales",
    phone: "+91 98000 22004",
    email: null,
    status: "active",
    availability: "off",
    created_at: "2026-10-08T09:00:00.000Z",
  },
] satisfies StaffMember[],
```

In `src/lib/demo/mutable-store.ts`: import `type StaffMember`; add to `DemoMutableBucket`:

```ts
staff: StaffMember[];
staffOverrides: Record<string, Partial<StaffMember>>;
```

and to `emptyBucket()`: `staff: [], staffOverrides: {},`. IMPORTANT: existing visitor cookies contain buckets WITHOUT these fields — every reader must use `bucket.staff ?? []` / `bucket.staffOverrides ?? {}` (Task 6 Step 6 and Task 7 do this).

- [ ] **Step 6: Create `src/lib/demo/staff-data.ts`**

```ts
import { getDemoBrandPack } from "@/lib/demo/brands";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { mergeStaff } from "@/lib/manager/staff";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { StaffMember } from "@/types/manager";

export async function listDemoStaff(
  brandCode?: DemoBrandCode,
): Promise<StaffMember[]> {
  const code = brandCode ?? "BR-1";
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeStaff(pack.staff, bucket.staff ?? [], bucket.staffOverrides ?? {});
}
```

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit` and `npm test`. Expected: clean, all green.

```bash
git add src/types/manager.ts src/lib/manager src/lib/demo/brands src/lib/demo/mutable-store.ts src/lib/demo/staff-data.ts
git commit -m "feat: staff domain types, demo fixtures and merge logic"
```

---

### Task 7: Staff server actions and Staff page UI

**Files:**
- Create: `src/services/manager-actions.ts`
- Create: `src/components/manager/staff-manager.tsx`
- Modify: `src/app/(workspace)/manager/staff/page.tsx` (replace Task 5 placeholder)

**Interfaces:**
- Consumes: `listDemoStaff` (Task 6), `validateStaffInput`, `StaffInput`, `STAFF_ROLES`, `STAFF_ROLE_LABELS`, `STAFF_AVAILABILITY_LABELS` (Task 6), `updateDemoMutableBucket`, `appendDemoAudit`, `getDemoBrandPack`, cookie brand resolution pattern from `src/lib/auth/settings-actions.ts:34-42`.
- Produces server actions (all return `{ ok: true } | { ok: false; message: string }`):
  - `createStaffAction(input: StaffInput)`
  - `updateStaffAction(id: string, input: StaffInput)`
  - `setStaffAvailabilityAction(id: string, availability: StaffAvailability)`
  - `setStaffStatusAction(id: string, status: "active" | "inactive")`
  - Client component `StaffManager({ staff, canEdit }: { staff: StaffMember[]; canEdit: boolean })`.

- [ ] **Step 1: Create `src/services/manager-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { appendDemoAudit, updateDemoMutableBucket } from "@/lib/demo/mutable-store";
import { validateStaffInput, type StaffInput } from "@/lib/manager/staff";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { StaffAvailability, StaffMember } from "@/types/manager";

const LIVE_UNAVAILABLE = {
  ok: false as const,
  message: "Staff management is not connected to live workspaces yet.",
};

async function resolveDemoBrandCode() {
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  return (
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ??
    "BR-1"
  );
}

function revalidateManager() {
  revalidatePath("/manager");
  revalidatePath("/manager/staff");
}

export async function createStaffAction(input: StaffInput) {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const member: StaffMember = {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brand_id: pack.brand.id,
    ...parsed.value,
    status: "active",
    availability: "available",
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staff: [...(bucket.staff ?? []), member],
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "staff.created",
    entity_type: "staff",
    entity_id: member.id,
    detail: member.name,
  });
  revalidateManager();
  return { ok: true as const };
}

export async function updateStaffAction(id: string, input: StaffInput) {
  const live = await loadLiveWorkspace();
  if (live) {
    if (!canEditBrandSettings(live.member.role)) {
      return { ok: false as const, message: "Not allowed." };
    }
    return LIVE_UNAVAILABLE;
  }
  const parsed = validateStaffInput(input);
  if (!parsed.ok) return parsed;
  const code = await resolveDemoBrandCode();
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], ...parsed.value },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}

export async function setStaffAvailabilityAction(
  id: string,
  availability: StaffAvailability,
) {
  if (!["available", "busy", "off"].includes(availability)) {
    return { ok: false as const, message: "Invalid availability." };
  }
  const live = await loadLiveWorkspace();
  if (live) return LIVE_UNAVAILABLE;
  const code = await resolveDemoBrandCode();
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], availability },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}

export async function setStaffStatusAction(id: string, status: "active" | "inactive") {
  if (status !== "active" && status !== "inactive") {
    return { ok: false as const, message: "Invalid status." };
  }
  const live = await loadLiveWorkspace();
  if (live) return LIVE_UNAVAILABLE;
  const code = await resolveDemoBrandCode();
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    staffOverrides: {
      ...(bucket.staffOverrides ?? {}),
      [id]: { ...(bucket.staffOverrides ?? {})[id], status },
    },
  }));
  revalidateManager();
  return { ok: true as const };
}
```

The audit entry shape matches `AuditLogEntry` in `src/types/database.ts:270-279` and existing call sites (`src/lib/demo/server.ts:191-198`).

- [ ] **Step 2: Create `src/components/manager/staff-manager.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createStaffAction,
  setStaffAvailabilityAction,
  setStaffStatusAction,
  updateStaffAction,
} from "@/services/manager-actions";
import {
  STAFF_AVAILABILITY_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
} from "@/lib/manager/staff";
import type { StaffAvailability, StaffMember } from "@/types/manager";
import { Card } from "@/components/ui/card";

export function StaffManager({
  staff,
  canEdit,
}: {
  staff: StaffMember[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(member: StaffMember | null) {
    setEditing(member);
    setName(member?.name ?? "");
    setRole(member?.role ?? "cashier");
    setPhone(member?.phone ?? "");
    setEmail(member?.email ?? "");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const input = { name, role, phone, email };
    const result = editing
      ? await updateStaffAction(editing.id, input)
      : await createStaffAction(input);
    setPending(false);
    if (result.ok) {
      startEdit(null);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  async function onAvailability(id: string, value: StaffAvailability) {
    const result = await setStaffAvailabilityAction(id, value);
    if (!result.ok) setError(result.message);
    else router.refresh();
  }

  async function onToggleStatus(member: StaffMember) {
    const result = await setStaffStatusAction(
      member.id,
      member.status === "active" ? "inactive" : "active",
    );
    if (!result.ok) setError(result.message);
    else router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add staff"}</h2>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Name</span>
            <input
              className="ob-input mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              disabled={!canEdit || pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Role</span>
            <select
              className="ob-input mt-1 w-full"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!canEdit || pending}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Phone (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              disabled={!canEdit || pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Email (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              disabled={!canEdit || pending}
            />
          </label>
          {error ? <p className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={!canEdit || pending}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add staff"}
            </button>
            {editing ? (
              <button
                type="button"
                className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm"
                onClick={() => startEdit(null)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        {staff.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {member.name}
                  {member.status === "inactive" ? (
                    <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">
                      Inactive
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-[var(--ob-text-muted)]">
                  {STAFF_ROLE_LABELS[member.role]}
                  {member.phone ? ` · ${member.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="ob-input ob-touch-target"
                  value={member.availability}
                  aria-label={`Availability for ${member.name}`}
                  disabled={!canEdit || member.status === "inactive"}
                  onChange={(e) =>
                    onAvailability(member.id, e.target.value as StaffAvailability)
                  }
                >
                  {(Object.keys(STAFF_AVAILABILITY_LABELS) as StaffAvailability[]).map(
                    (a) => (
                      <option key={a} value={a}>
                        {STAFF_AVAILABILITY_LABELS[a]}
                      </option>
                    ),
                  )}
                </select>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      onClick={() => startEdit(member)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      onClick={() => onToggleStatus(member)}
                    >
                      {member.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Check `src/components/ui/card.tsx` export shape before writing (assumed named export `Card` accepting `className` — matches usage in `customers/page.tsx`).

- [ ] **Step 3: Replace the Staff page**

```tsx
// src/app/(workspace)/manager/staff/page.tsx
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { StaffManager } from "@/components/manager/staff-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff">
        <ManagerSubnav activeHref="/manager/staff" />
        <EmptyState
          title="Staff is not connected to live workspaces yet"
          description="Employee records need the staff tables in the live database. Demo workspaces have full staff management today."
        />
      </PageShell>
    );
  }

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Staff">
      <ManagerSubnav activeHref="/manager/staff" />
      <StaffManager staff={staff} canEdit />
    </PageShell>
  );
}
```

- [ ] **Step 4: Verify in browser (golden path + edges)**

Dev server running; open `/demo?brand=BR-1` → Manager → Staff. Verify: 4 fixture staff listed; add a new staff member (appears after save, persists across reload); edit its name/role; change availability via select (persists); deactivate then activate; empty name shows validation error. Repeat add with `?brand=BR-2` and confirm brands don't share staff. Check 375px: form stacks above cards, all controls ≥ 44px. Check browser console for errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/manager-actions.ts src/components/manager/staff-manager.tsx "src/app/(workspace)/manager/staff/page.tsx"
git commit -m "feat: demo staff management with add, edit, availability and status"
```

---

### Task 8: Management Overview and Settings visibility toggles

**Files:**
- Modify: `src/app/(workspace)/manager/page.tsx` (replace Task 5 placeholder)
- Create: `src/components/settings/manager-modules-setting.tsx`
- Modify: `src/app/(workspace)/settings/page.tsx` (Features tab, near `QuotationBuilderSetting` around line 143)

**Interfaces:**
- Consumes: `listDemoStaff`, `staffAvailabilitySummary`, `MANAGER_MODULES`, `visibleManagerModules`, `setManagerModuleHidden` (Task 3), `canEditWorkspaceFeatures` (already used by settings page).
- Produces: `ManagerModulesSetting({ hidden, canEdit }: { hidden: ManagerModuleKey[]; canEdit: boolean })` client component.

- [ ] **Step 1: Replace the overview page**

```tsx
// src/app/(workspace)/manager/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  staff: "Profiles, roles and availability.",
  services: "Not built yet — planned for Phase 2.",
  appointments: "Not built yet — planned for Phase 2.",
  visits: "Not built yet — planned for Phase 2.",
  schedules: "Not built yet — planned for Phase 2.",
  tasks: "Not built yet — planned for Phase 2.",
};

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const modules = visibleManagerModules(ws.hiddenManagerModules);

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Management Overview">
        <ManagerSubnav activeHref="/manager" />
        <EmptyState
          title="Manager is not connected to live workspaces yet"
          description="Operational data needs the staff and operations tables in the live database. Demo workspaces show the Manager experience today."
        />
      </PageShell>
    );
  }

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  const summary = staffAvailabilitySummary(staff);
  const stats = [
    { label: "Active staff", value: summary.active },
    { label: "Available now", value: summary.available },
    { label: "Busy", value: summary.busy },
    { label: "Off duty", value: summary.off },
  ];

  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-sm text-[var(--ob-text-muted)]">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.key} href={module.href} className="block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="font-medium">{module.label}</p>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {MODULE_DESCRIPTIONS[module.key]}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Create `src/components/settings/manager-modules-setting.tsx`**

Follow the `QuotationBuilderSetting` pattern (`src/components/settings/quotation-builder-setting.tsx`):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setManagerModuleHidden } from "@/lib/auth/settings-actions";
import { MANAGER_MODULES, type ManagerModuleKey } from "@/lib/workspace/manager-modules";

export function ManagerModulesSetting({
  hidden,
  canEdit,
}: {
  hidden: ManagerModuleKey[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [hiddenState, setHiddenState] = useState(hidden);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onToggle(key: ManagerModuleKey, visible: boolean) {
    if (!canEdit || pending) return;
    setPending(true);
    setError(null);
    const result = await setManagerModuleHidden(key, !visible);
    setPending(false);
    if (result.ok) {
      setHiddenState((prev) =>
        visible ? prev.filter((k) => k !== key) : [...prev, key],
      );
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
      <span className="font-medium">Manager modules</span>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Hide modules this business doesn&apos;t use. Hidden modules disappear from
        the sidebar and Manager sub-navigation.
      </p>
      <div className="mt-3 space-y-2">
        {MANAGER_MODULES.map((module) => {
          const visible = !hiddenState.includes(module.key);
          return (
            <label
              key={module.key}
              className="ob-touch-target flex items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={visible}
                disabled={!canEdit || pending}
                onChange={(e) => onToggle(module.key, e.target.checked)}
              />
              {module.label}
            </label>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--ob-danger)]">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 3: Mount in the settings page**

In `src/app/(workspace)/settings/page.tsx`: import `ManagerModulesSetting`. Read the file first (the user may have edited it). In the Features tab section, directly after the `<QuotationBuilderSetting ... />` element, add:

```tsx
<ManagerModulesSetting hidden={ws.hiddenManagerModules} canEdit={canEdit} />
```

(`ws` and `canEdit` are already in scope there — verify the local variable names when reading and match them.)

- [ ] **Step 4: Verify in browser**

`/demo?brand=BR-1` → Settings → Features: uncheck "Visits & Field Ops". Verify: sidebar Manager group loses the Visits child; `/manager` sub-nav and module cards lose Visits; direct visit to `/manager/visits` redirects to `/manager`; reload persists the change. Re-check Visits to restore. Verify overview stats match the Staff page (change one availability, confirm the overview count updates). Verify BR-2 visibility is independent of BR-1.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(workspace)/manager/page.tsx" src/components/settings/manager-modules-setting.tsx "src/app/(workspace)/settings/page.tsx"
git commit -m "feat: Management Overview dashboard and per-brand module visibility settings"
```

---

### Task 9: Full verification pass

**Files:** none created; fixes only if verification fails.

- [ ] **Step 1: Static checks**

Run: `npm run lint`, `npx tsc --noEmit`, `npm test`.
Expected: all clean. Fix any failures before proceeding (do not skip hooks or disable rules to silence them).

- [ ] **Step 2: Production build**

Run: `npm run build`.
Expected: succeeds; `/manager/*` routes listed in the build output.

- [ ] **Step 3: Browser regression sweep (both brands, desktop + 375px)**

With the dev server running, in a NEW browser tab:
1. `/demo?brand=BR-1`: Dashboard, Billing, Orders, Products, Analytics, Customers, Payments, Settings all still render (nav refactor regression check).
2. Manager flow: overview stats → Staff add/edit/availability/deactivate → hide a module in Settings → confirm nav/subnav/direct-URL redirect → restore.
3. `/demo?brand=BR-2`: quotation/bill split nav intact; Manager shows technician staff; module visibility independent of BR-1.
4. At 375px: mobile drawer shows Manager group; sub-nav scrolls; touch targets ≥ 44px; no horizontal page overflow.
5. Console: no new errors (the known environmental unsafe-eval CSP error from the dev overlay is pre-existing, not a regression — remove `nextjs-portal` via evaluate if it blocks clicks).

- [ ] **Step 4: Clean up and final commit**

Stop any dev server you started (leave the user's own servers alone). Delete nothing in the repo. If verification required fixes, commit them:

```bash
git add -A -- src
git commit -m "fix: Manager foundation verification fixes"
```

(Skip this commit if there are no changes. Review `git status` before committing — never stage unrelated user edits.)