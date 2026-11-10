# Premium Dashboard UI Redesign — Design Spec

**Date:** 2026-11-11
**Branch:** `feat/premium-dashboard-ui` (off `main` @ 5f19392, which now contains order-lifecycle)
**Scope:** Whole-app visual + motion refresh. Presentation layer only — no changes to business logic, data models, revenue rules, or the completed-only payment flow.

## Goal

Give OrderBook a premium, polished dashboard feel across the whole app using a dual light/dark theme with a persisted toggle, richer motion, and the specific effects the owner referenced (Motion.dev + Aceternity patterns), while keeping the app fast and usable for real POS work on phones.

## Non-goals

- No new dependencies beyond `motion`. No Aceternity Pro / Motion+ licenses purchased — all effects are hand-rolled from the researched patterns.
- No change to demo fixtures, analytics snapshot math, order lifecycle rules, billing logic, or Supabase schema. The seed SQL and Phase 2+ program are untouched.
- No routing/URL changes, no new pages, no auth changes.
- Not a component-library swap. We evolve the existing `src/components/ui/*` primitives in place.

## Locked decisions (from owner)

1. **Theme:** Dual theme + toggle (Refined Light AND Dark Premium), switchable, persisted.
2. **Palette:** Keep OrderBook navy `#1b3654` + teal `#0f766e` in light; add indigo `#6366f1` → teal `#2dd4bf` glow in dark. Brand identity preserved.
3. **Charts:** Keep `recharts` as the data engine; add Motion-driven chrome on top. Do not hand-roll full custom charts.
4. **Motion intensity:** Rich on showcase surfaces (login, dashboard, analytics); calm in transactional surfaces (billing, orders board, tables, forms). All infinite motion gated by reduced-motion.
5. **Phasing:** Phase 1 foundation, Phase 2 data-viz. Owner builds Phase 1 first, reviews, then Phase 2.
6. **Prerequisite (done):** order-lifecycle merged into `main` locally at 5f19392. Not pushed.

## Architecture

### Dependency

Add `motion` (the package that ships `motion/react`, successor to `framer-motion`), React 19–compatible. All motion components import from `"motion/react"`. Single new runtime dep.

### Dual-theme system

- Extend `src/app/globals.css`: `:root` keeps today's light values and gains new premium tokens; add a `[data-theme="dark"]` block overriding them.
- New tokens (both themes defined, dark values glow):
  - `--ob-panel` / `--ob-panel-border` — card/panel surface (light: white / `--ob-border`; dark: translucent glass `rgba(255,255,255,.045)` / `rgba(255,255,255,.09)`).
  - `--ob-accent-2` — indigo (`#4f46e5` light, `#6366f1`/glow dark).
  - `--ob-glow` — a soft accent shadow used by buttons/logo/dark cards (`0 0 0 1px rgba(99,102,241,.12), 0 18px 40px rgba(0,0,0,.35)` dark; light ≈ `--ob-shadow-md`).
  - `--ob-gradient-primary` — primary button/brand gradient (light: navy→teal solid-ish; dark: indigo→teal).
  - `--ob-ambient-a` / `--ob-ambient-b` — ambient background tints (stronger in dark).
- `@theme inline` block extended so Tailwind utilities can reference the new vars where needed.
- **No-flash + SSR-correct application:** the active theme is stored in an httpOnly=false cookie (`ob-theme`) AND `localStorage`. The root layout reads the cookie server-side and renders `data-theme` on `<html>` so the first paint is already themed (avoids flash and hydration mismatch). The client toggle updates `data-theme`, `localStorage`, and the cookie, and is the single source of truth after load. First visit with no cookie defaults from `prefers-color-scheme` (resolved in the layout, then persisted on first toggle).
  - Per AGENTS.md, the exact Next 16 document/metadata/`cookies()` API is confirmed against `node_modules/next/dist/docs` before coding.
- The theme toggle lives in the sidebar footer and the header (icon button), `ob-touch-target` sized, `aria-label` + `aria-pressed`.

### Motion infrastructure

- A shared easing token mirrors the existing `cubic-bezier(0.22,1,0.36,1)` used throughout `globals.css`, so Motion and CSS transitions feel identical.
- `useReducedMotion()` from `motion/react` gates every looping/infinite animation. Where a CSS keyframe already has a `@media (prefers-reduced-motion)` guard (existing animations keep it), new JS-driven effects get the equivalent guard.

## Components (presentation-only)

### Buttons — `src/components/ui/button.tsx`
- Theme-aware via new tokens; `primary` uses `--ob-gradient-primary` + `--ob-glow` in dark.
- Motion press ripple: a quick scale/`whileTap` on the `ob-press` behavior; `loading` becomes a Stateful-button micro-state (spinner + label) without changing the `loading` prop contract already used by callers (`loading={pending}`).
- Variants/props unchanged: `variant`, `loading`, `disabled`, `children`. Existing call sites keep working.

### `AnimatedNumber` — new `src/components/ui/animated-number.tsx`
- Props: `value: number`, `format?: (n:number)=>string` (default locale `en-IN`), `prefix?`, `suffix?`, `duration?`.
- Counts up from 0 via `useInView` (once) + `useSpring`; renders `format(springValue)`.
- **Reduced-motion:** renders the final formatted value immediately, no spring.
- `StatCard` keeps its current string `value` API; a `numericValue?: number` is added so existing string usages (money strings) stay valid and the dashboard KPI grid opts into `AnimatedNumber`. Non-breaking.

### Smooth tabs — `src/components/ui/tabs.tsx`, `segmented-control.tsx`, `manager/manager-subnav.tsx`
- Sliding pill indicator via a single `layoutId`; active content swaps with `AnimatePresence` directional variants (`custom = direction` from index delta).
- API unchanged: `value`, `onChange`, `options`, `label`.
- A11y preserved: `role="tablist"`, `role="tab"`, `aria-selected`, arrow-key + Home/End navigation; pill is `aria-hidden`.

### Grouped sidebar — `src/components/shell/app-shell.tsx`
- Keep `buildWorkspaceNavItems(...)` data and existing grouping (children already supported).
- Add Motion width animation (expanded ↔ collapsed) and persist collapse state to `localStorage` (currently component `useState` only).
- Collapsed mode: icon-only rail; expanded-group children stack as icons. Active item highlight uses `layoutId`.
- Add the theme toggle in the footer and brand logo (ripple mark) in the header.

### Brand logo — `loading-ripple` OB mark
- New `src/components/brand/logo-mark.tsx`: the `OB` glyph with 3 `motion.div` concentric rings (staggered `scale`/`opacity` outward loop) behind it.
- Reduced-motion: single static ring, no loop.
- Used in sidebar header, login card, and the loading state. Replaces the current static `.ob-mark` usage in `app-shell.tsx` and `login-form.tsx`.

### Notifications — new `src/components/notifications/`
- `NotificationProvider` (client, mounted once in `(workspace)/layout.tsx`): context + reducer. Actions: `push(toast)`, `dismiss(id)`, and a separate persistent notification list for the stacked center.
- **Stacked center** (top-right): collapsed = scaled/faded pile showing count; expanded = full list. `AnimatePresence` for add/remove, Motion variants for collapse/expand. `aria-live="polite"` announces new items; expand button has `aria-expanded`; keyboard-operable.
- **Toasts:** transient (auto-dismiss) for action outcomes.
- **Wiring (presentation only — reads existing action results):**
  - Existing server actions already return `{ok:true}|{ok:false,message}`. Client components surface a toast on success/failure (order completed, payment recorded, product saved, stock adjusted) — no logic changes, just invoking `notify(...)` where the result is already handled.
  - Demo-only "incoming order" simulated feed on the dashboard while in demo mode (clearly a demo affordance), so the stack is visible without real events.
- Placement anchored so it never overlaps `headerActions` or covers touch targets at 375px.

### Background ripple — new `src/components/effects/background-ripple.tsx`
- Hand-rolled Aceternity background-ripple pattern: responsive cell grid, per-cell `Math.hypot`-based delay, pure CSS `@keyframes` + light JS state. Props: `rows`, `cols`, `cellSize`, `interactive` (default `false`), `onCellClick` optional.
- Rendered `aria-hidden`, `pointer-events: none`. Used behind the dashboard hero band and the login card only (showcase surfaces). Not placed in dense transactional screens.
- Reduced-motion: renders the static grid, no wave.

## Data-viz (Phase 2)

- Keep `recharts` (`TrendChart`, `ShareDonut`) and the analytics snapshot inputs. Change only presentation.
- **Theme-aware colors:** `CHART_COLORS` and hardcoded `#1b3654`/`#0f766e` reads resolve from CSS vars (via `getComputedStyle` on a themed hook, or a theme-context color map) so light/dark both read correctly; grid/tick colors tokenized.
- **Glowing trend line:** dark theme adds an SVG glow filter + gradient stroke on the revenue/orders line; light keeps the clean line.
- **Cursor crosshair:** a `motion` overlay on the trend chart maps pointer x → nearest data point, shows a vertical crosshair and an animated number readout (spring on the value). Reduced-motion: static hover tooltip only (recharts Tooltip remains the fallback — always available).
- **Ticker-overflow square tiles:** new square analytics tile whose content strip scrolls edge-to-edge inside the clip (duplicated nodes + looping x-translate). Used for a strip of recent order numbers / top products. Reduced-motion: static, no loop.

## Rich vs calm mapping

| Surface | Ambient bg | Logo ripple | Count-up | Chart motion | Notes |
|---|---|---|---|---|---|
| Login | ripple | yes | n/a | n/a | showcase |
| Dashboard | ripple/aurora | yes | yes | glowing line + ticker | showcase |
| Analytics | subtle grid | no | yes | glowing line + cursor + ticker | showcase |
| Billing | none | no | no | none | workflow: calm, fast |
| Orders board/detail | none | no | no | none | workflow |
| Tables/forms | none | no | no | none | workflow |

## Accessibility & phone-first (owner standing rules)

- `prefers-reduced-motion: reduce` disables every infinite loop and renders final numbers instantly.
- 44px touch targets preserved (`ob-touch-target`) for toggle, notification expand, tabs, buttons.
- Text contrast verified against both themes over any animated background (backgrounds stay behind content, low alpha).
- Background effects `aria-hidden` + `pointer-events:none` so they never intercept POS taps or pollute the a11y tree.
- Verified at ~375px width, no horizontal overflow, in both themes.

## Testing

**Unit (Vitest, node):**
- Theme: token application per `data-theme`; toggle persists cookie + `localStorage`; first-paint default from `prefers-color-scheme`.
- `AnimatedNumber`: reduced-motion → final value instantly; non-reduced → converges to `format(value)`; rounding/formatting correct.
- Smooth tabs: `role`/`aria-selected`/arrow-key behavior intact after Motion refactor.
- Notification reducer: push/dismiss/expand/collapse transitions; dedupe; cap.
- Background-ripple / ticker-overflow: renders duplicated strip; `interactive:false` default; no data dependency.

**Regression:**
- Existing 190 unit tests must remain green (no logic changed).
- Typegen + `tsc --noEmit` clean; `eslint src --max-warnings=0` clean.

**E2E (Playwright isolated browser, dev on `:3003`; never `:3000`):**
- Toggle light↔dark persists across reload.
- Dashboard KPI count-up on load (and instant under reduced-motion emulation).
- Complete an order → success toast + notification appears.
- Analytics trend cursor readout updates on hover.
- Background ripple present on dashboard/login, absent on billing.
- 375px, both themes: no horizontal overflow; touch targets ≥44px.
- Remove `nextjs-portal` overlay before clicking (known env quirk).

## Phasing & delivery

- **Phase 1 — foundation:** `motion` dep, dual-theme tokens + no-flash SSR + toggle, buttons, grouped sidebar + persistence, logo mark, notification provider + toasts + stack, background-ripple. Ships a fully re-skinned, theme-switching app shell with login/dashboard/analytics chrome (charts still recharts-default in Phase 1).
- **Phase 2 — data-viz:** `AnimatedNumber` KPI grids, recharts chrome (theme colors, glowing line, cursor crosshair), ticker-overflow tiles, smooth tabs rollout.
- Each phase: implement → self-verify (unit + tsc + eslint + E2E) → owner reviews in browser → integrate.

## Risks / watch-outs

- **Theme flash / hydration mismatch:** mitigated by server-read cookie setting `data-theme` before paint. Must confirm Next 16 root-document cookie read pattern (AGENTS.md doc check).
- **SSR vs client motion:** all Motion components are `"use client"`; server pages pass plain props in. Providers mounted once.
- **Recharts theme-reactivity:** recharts doesn't read CSS vars in `stroke` props automatically; needs a small themed color resolver. Cursor overlay must not fight recharts' own Tooltip.
- **Perf on mobile:** ambient ripple + tilt + count-up together could cost frames on low-end phones; Phase 1 keeps heavy ambient effects to non-transactional screens and caps animated grid cells.
- **Cookie size:** `ob-theme` is a tiny value; existing demo-cookie header budget (`--max-http-header-size=65536`) already covers added cookie.
- **Shared browser:** verify via Playwright MCP's isolated browser, not the owner's Chrome tabs.

## Out of scope (explicit)

- Pushing `main` or any branch (owner pushes; nothing is pushed here).
- Wiring live/real-time notifications to Supabase (demo feed + action toasts only).
- Changing any revenue/analytics numbers or order lifecycle behavior.
