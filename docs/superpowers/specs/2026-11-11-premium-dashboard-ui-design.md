# Premium Dashboard UI Redesign — Design Spec

**Date:** 2026-11-11
**Branch:** `feat/premium-dashboard-ui` (off `main` @ 5f19392, which now contains order-lifecycle)
**Scope:** Whole-app visual + motion refresh. Presentation layer only — no changes to business logic, data models, revenue rules, or the completed-only payment flow.

## Goal

Give OrderBook a premium, polished dashboard feel across the whole app using a dual light/dark theme with a persisted toggle, richer motion, and the specific effects the owner referenced (Motion.dev + Aceternity + "HALO Design Lab" component patterns), while keeping the app fast and usable for real POS work on phones.

## Non-goals

- No new dependencies beyond `motion`. No Aceternity Pro / Motion+ / HALO licenses — all effects are hand-rolled from the researched reference patterns.
- No change to demo fixtures, analytics snapshot math, order lifecycle rules, billing logic, or Supabase schema.
- No routing/URL changes, no new pages, no auth changes.
- Not a component-library swap. We evolve the existing `src/components/ui/*` primitives in place and keep `recharts` as the chart engine (restyled, not replaced).

## Locked decisions (from owner)

1. **Theme:** Dual theme + toggle (Refined Light AND Dark Premium), switchable, persisted.
2. **Palette:** Keep OrderBook navy `#1b3654` + teal `#0f766e` in light; add indigo `#6366f1` → teal `#2dd4bf` glow in dark.
3. **Charts engine:** Keep `recharts`, **restyled to the HALO "professional" look** (separable-hue/gradient bars with direct value labels + grow-in; premium donut; add sparkline tiles). No hand-rolled chart replacement.
4. **KPI numbers:** **Odometer digit-roll** (odometer.js-style ease-out roll) on every big analytics number — dashboard KPI cards + analytics stat boxes. Reduced-motion → final value instantly.
5. **App background:** **Meteors** (diagonal glowing streaks) as the primary ambient layer on showcase surfaces. The earlier background-ripple idea is **dropped** (no competing ambient layer).
6. **Analysis boxes:** **Pointer-glow** — a cursor-tracking rim light on KPI/analysis cards (desktop hover; neutral on touch/reduced-motion).
7. **Motion intensity:** Rich on showcase surfaces (login, dashboard, analytics); calm in transactional surfaces (billing, orders board, tables, forms). All infinite motion gated by reduced-motion.
8. **Phasing:** Phase 1 = theme + motion chrome (incl. odometer, meteors, pointer-glow). Phase 2 = chart restyle + tabs. Owner builds Phase 1, reviews in browser, then Phase 2.
9. **Prerequisite (done):** order-lifecycle merged into `main` locally at 5f19392. Not pushed.

## Architecture

### Dependency

Add `motion` (ships `motion/react`, successor to framer-motion), React 19–compatible. All motion components import from `"motion/react"`. Single new runtime dep; `recharts` stays.

### Dual-theme system

- Extend `src/app/globals.css`: `:root` keeps today's light values and gains new premium tokens; add a `[data-theme="dark"]` block overriding them.
- New tokens (both themes defined, dark values glow):
  - `--ob-panel` / `--ob-panel-border` — card/panel surface (light: white / `--ob-border`; dark: translucent glass `rgba(255,255,255,.045)` / `rgba(255,255,255,.09)`).
  - `--ob-accent-2` — indigo (`#4f46e5` light, `#6366f1` dark).
  - `--ob-glow` — soft accent shadow for buttons/logo/dark cards.
  - `--ob-gradient-primary` — primary button/brand gradient (light: navy→teal; dark: indigo→teal).
  - `--ob-ambient-a` / `--ob-ambient-b` — ambient/meteor tint colors (stronger in dark).
  - `--ob-series-1..8` — theme-aware categorical chart colors (replaces hardcoded `CHART_COLORS`).
- `@theme inline` block extended so Tailwind utilities can reference the new vars.
- **No-flash + SSR-correct application:** active theme in an httpOnly=false cookie (`ob-theme`) + `localStorage`. Root layout reads the cookie server-side and renders `data-theme` on `<html>` so first paint is already themed (no flash, no hydration mismatch). Client toggle updates `data-theme`, `localStorage`, and the cookie (cookie authoritative for SSR; client is source of truth after load). No cookie → default from `prefers-color-scheme`. Per AGENTS.md, confirm the Next 16 root-document / `cookies()` API in `node_modules/next/dist/docs` before coding.
- Theme toggle in sidebar footer + header (icon button), `ob-touch-target` sized, `aria-label` + `aria-pressed`.

### Motion infrastructure

- Shared easing token mirrors the existing `cubic-bezier(0.22,1,0.36,1)` so Motion and CSS feel identical.
- `useReducedMotion()` gates every looping/infinite animation (meteors, odometer, ripple-free logo ring, ticker). Where existing CSS keyframes already have a `@media (prefers-reduced-motion)` guard, keep it; new JS effects get the equivalent.

## Components (presentation-only)

### Buttons — `src/components/ui/button.tsx`
- Theme-aware via new tokens; `primary` uses `--ob-gradient-primary` + `--ob-glow` in dark.
- Motion press ripple (`whileTap`) on `ob-press`; `loading` becomes a Stateful micro-state (spinner + label). Variant/`loading`/`disabled`/`children` props unchanged → existing `loading={pending}` call sites keep working.

### Odometer — new `src/components/ui/odometer.tsx` (replaces the planned `AnimatedNumber`)
- Props: `value: number`, `format?: (n:number)=>string` (default `en-IN`), `prefix?`, `suffix?`, `duration?`, `decimals?`.
- Mechanical **digit-roll**: each digit is a vertical column of 0–9 translated by `motion` spring/timing with a slight per-column stagger, ease-out cubic; the whole number rolls up from 0 on first view (`useInView`).
- Money/count KPIs feed `value`; formatting (currency compact, separators) via `format`.
- **Reduced-motion:** render the final formatted value instantly, no roll.
- `StatCard` keeps its string `value` API and gains `numericValue?: number` + `format` so the dashboard/analytics KPI grid opts into the odometer; non-breaking.

### Pointer-glow — new `src/components/effects/pointer-glow.tsx`
- Card wrapper that tracks the pointer and paints a masked radial-gradient rim light + soft surface glow (HALO "pointer glow" / card-spotlight pattern). Pure CSS mask + pointer position; lightweight.
- Props: `children`, optional `intensity`. Renders `aria-hidden` overlay inside the card.
- Touch devices: no pointer → neutral default card. Reduced-motion: glow present but non-animated (no tracking jitter).
- Applied to `StatCard` + analytics tile cards on dashboard/analytics (showcase only; not on billing/orders tables).

### Smooth tabs — `src/components/ui/tabs.tsx`, `segmented-control.tsx`, `manager/manager-subnav.tsx`
- Sliding pill via a single `layoutId`; content swaps with `AnimatePresence` directional variants (`custom = direction`). API unchanged (`value`, `onChange`, `options`, `label`).
- A11y intact: `role="tablist"/tab`, `aria-selected`, arrow-key + Home/End; pill `aria-hidden`.

### Grouped sidebar — `src/components/shell/app-shell.tsx`
- Keep `buildWorkspaceNavItems(...)` grouping. Add Motion width animation (expanded ↔ collapsed) + `localStorage` persistence. Collapsed = icon-only rail; active item uses `layoutId`. Theme toggle in footer; brand logo in header.

### Brand logo — `src/components/brand/logo-mark.tsx`
- The `OB` glyph with 3 staggered `motion.div` concentric ripple rings behind it (loading-ripple pattern). Reduced-motion → single static ring. Used in sidebar header, login card, loading state. Replaces static `.ob-mark` in `app-shell.tsx` + `login-form.tsx`.

### Notifications — new `src/components/notifications/`
- `NotificationProvider` (client, mounted once in `(workspace)/layout.tsx`): context + reducer (`push`, `dismiss`, persistent list for the center).
- **Stacked center** (top-right): collapsed scaled/faded pile with count; expanded full list. `AnimatePresence` add/remove, Motion variants expand/collapse. `aria-live="polite"` for new items; `aria-expanded` + keyboard.
- **Toasts:** transient auto-dismiss for action outcomes.
- **Wiring (presentation only):** client components call `notify(...)` where existing actions already return `{ok:true}|{ok:false,message}` (order completed, payment recorded, product saved, stock adjusted) — no logic change.
- **Demo affordance:** a simulated "incoming order" feed in demo mode on the dashboard so the stack is visible without real events. (Owner to confirm keep vs action-only.)
- Anchored so it never overlaps `headerActions` or covers touch targets at 375px.

### Meteors background — new `src/components/effects/meteors.tsx` (replaces the planned background-ripple)
- Diagonal streaking particles with a glowing head (Aceternity meteors pattern; CSS `@keyframes` + JS-generated elements). Props: `count` (capped, lower on small screens), `className`.
- Rendered as a fixed/absolute `aria-hidden` layer behind page content, `pointer-events: none`. Placed on **login, dashboard, analytics only**; **not** on billing/orders/tables/forms.
- Reduced-motion: render 0 animated meteors (clean static gradient), never empty-white.
- Perf: cap meteor count and reduce on `pointer: coarse` / narrow viewports.

## Data-viz (Phase 2)

- Keep `recharts` (`TrendChart`, `ShareDonut`) + analytics snapshot inputs; change only presentation.
- **Theme-aware colors:** charts read the new `--ob-series-*` tokens (via a small theme-color resolver or theme context) so light/dark both render correctly; grid/tick colors tokenized. No hardcoded `#1b3654`/`#0f766e` in chart internals.
- **Bar (HALO look):** separable-hue/gradient bars, `radius` rounded caps, **direct value labels** above/inside bars, grow-on-mount animation (`recharts` `isAnimationActive` / Motion entrance), hover emphasis. Used for categorical revenue (e.g. by product/category/weekday).
- **Donut (HALO look):** premium `ShareDonut` — themed segment palette, subtle segment hover glow/scale, **center = odometer total** + label.
- **Sparkline (new):** tiny inline trend for compact tiles (recent orders, per-product, per-staff) — minimal `recharts` area/line with no axes; optional pointer-glow on its card.
- **Trend (existing time-series):** glowing line (gradient stroke + dark-theme SVG glow filter) + a `motion` cursor crosshair mapping pointer x → nearest point with an animated odometer readout. Recharts Tooltip remains the always-available fallback; reduced-motion → static tooltip only, no cursor loop.
- **Ticker-overflow square tile (new):** clipped square card whose content strip loops edge-to-edge (duplicated nodes + looping x-translate) for recent order numbers / top products. Reduced-motion → static, no loop.

## Rich vs calm mapping

| Surface | Ambient (meteors) | Logo ripple | Odometer | Pointer-glow | Charts |
|---|---|---|---|---|---|
| Login | yes | yes | n/a | n/a | n/a |
| Dashboard | yes | yes | yes | yes on KPI cards | trend + sparkline + ticker tile |
| Analytics | yes | no | yes | yes on stat boxes | bar + donut + trend + sparkline |
| Billing | none | no | no | no | none |
| Orders board/detail | none | no | no | no | none |
| Tables/forms | none | no | no | no | none |

## Accessibility & phone-first (owner standing rules)

- `prefers-reduced-motion: reduce` disables all loops (meteors, odometer roll, ticker, logo ring) and renders final numbers instantly.
- 44px touch targets preserved (`ob-touch-target`) for toggle, notification expand, tabs, buttons.
- Text contrast verified against both themes over any ambient layer (meteors/glow stay behind content, low alpha).
- Ambient + glow layers `aria-hidden` + `pointer-events:none` so they never intercept POS taps or pollute the a11y tree.
- Verified at ~375px width, no horizontal overflow, both themes.

## Testing

**Unit (Vitest, node):**
- Theme: token application per `data-theme`; toggle persists cookie + `localStorage`; first-paint default from `prefers-color-scheme`.
- Odometer: reduced-motion → final value instantly; roll converges to `format(value)`; rounding/decimals/format correct.
- Pointer-glow: overlay is `aria-hidden`; no data dependency; neutral without pointer.
- Meteors: `count` capped incl. narrow/`pointer: coarse`; `aria-hidden`; reduced-motion → none.
- Smooth tabs: `role`/`aria-selected`/arrow-key intact after Motion refactor.
- Notification reducer: push/dismiss/expand/collapse; dedupe; cap.
- Charts (Phase 2): restyled components render from existing snapshot inputs; theme-color resolver returns light/dark series; no change to underlying numbers (assert same totals as current snapshot tests).

**Regression:**
- Existing 190 unit tests stay green (no logic changed).
- Typegen + `tsc --noEmit` clean; `eslint src --max-warnings=0` clean.

**E2E (Playwright isolated browser, dev on `:3003`; never `:3000`):**
- Toggle light↔dark persists across reload.
- Dashboard KPI odometers roll on load (instant under reduced-motion emulation).
- Complete an order → success toast + notification appears.
- Pointer-glow tracks cursor over a KPI card (desktop viewport).
- Meteors present on dashboard/login/analytics, absent on billing.
- Analytics bar value labels + donut center odometer + trend cursor readout render.
- 375px, both themes: no horizontal overflow; touch targets ≥44px.
- Remove `nextjs-portal` overlay before clicking (known env quirk).

## Phasing & delivery

- **Phase 1 — foundation + chrome:** `motion` dep; dual-theme tokens + no-flash SSR + toggle; buttons; grouped sidebar + persistence; brand logo ripple; notification provider + toasts + stack; **meteors** background; **odometer** KPI numbers; **pointer-glow** cards. Ships a fully re-skinned, theme-switching app with premium feel; charts still default-styled recharts.
- **Phase 2 — data-viz:** recharts restyle to HALO look (bar w/ value labels, premium donut w/ odometer center, glowing trend + cursor, sparkline tiles, ticker-overflow tile); theme-aware `--ob-series-*`; smooth-tabs rollout.
- Each phase: implement → self-verify (unit + typegen + tsc + eslint + E2E) → owner reviews in browser on `:3003` → integrate.

## Risks / watch-outs

- **Theme flash / hydration mismatch:** cookie-driven `data-theme` before paint; confirm Next 16 root-document cookie read (AGENTS.md doc check).
- **SSR vs client motion:** all Motion components `"use client"`; server pages pass plain props; providers mounted once.
- **Recharts theming:** recharts doesn't auto-read CSS vars in `stroke`/`fill`; needs a small themed color resolver; cursor overlay must not fight recharts' own Tooltip; value labels must truncate/rotate to avoid overflow at 375px.
- **Odometer perf:** many rolling digit columns on dashboard could cost frames on low-end phones; cap simultaneous rolls (trigger once, short duration), fall back to instant under reduced-motion.
- **Meteors perf/busy-ness:** cap count, lighter in light theme, none in workflow screens; keep behind content.
- **Cookie size:** tiny value; existing `--max-http-header-size=65536` already covers it.
- **Shared browser:** verify in Playwright MCP isolated browser, not owner's Chrome.

## Out of scope (explicit)

- Pushing `main` or any branch (owner pushes; nothing pushed here).
- Real-time/Supabase-wired notifications (demo feed + action toasts only).
- Any change to revenue/analytics numbers or order lifecycle behavior.

## Reference sources (researched)

- Motion.dev: smooth-tabs (React), loading-ripple (JS), notifications-stack (JS), ticker-overflow + line-graph (Vue → ported), 
- Aceternity: meteors (background), pointer-glow / card spotlight, grouped-sidebar, stats-with-number-ticker.
- HALO Design Lab (vcdemo10.netlify.app/s/halo/d/*): bar-chart, donut-chart, sparkline, odometer, meteors, pointer-glow.
- Notes in `/tmp/orderbook-ui-refs.md`.
