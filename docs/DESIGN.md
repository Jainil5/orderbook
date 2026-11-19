# Design direction — Dark Botanical / Lab Green

## Reference

The system was adopted from a **Dark Botanical / Lab Green** design handoff: one
deep green field, one saturated leaf accent, one warm sand accent, two fonts and
four signature motions. The handoff rule is *"copy the system, replace the
content"* — OrderBook took the colours, type, radii, motion and layout rhythm and
applied them to its own screens. The marketing copy, brand name and business
data are OrderBook's.

## Principles

- **Leaf is the only saturated thing in the layout.** `--ob-leaf` means *action
  or emphasis* and nothing else, so a leaf pill is always a thing to click or the
  number you should look at. `--ob-sand` is reserved for discounts, meta and
  warning states. There is no purple, no blue and no second brand colour.
- **Two shape languages, nothing square.** Pills (`999px`) for anything you
  press, select or tag; soft superellipses (`14–30px`) for surfaces. The
  smallest radius in the system is 14px — the only exception is the 2px dash
  bullet.
- **Hierarchy comes from type, not colour.** Bricolage Grotesque at 600/800 for
  headlines, numbers, prices and the wordmark; Instrument Sans for body, UI,
  links and every uppercase micro-label. Headings are tight
  (`letter-spacing: -0.025em`, `line-height: 1.06`), which is what makes the type
  read as designed rather than defaulted.
- **Everything floats on glass.** Cards, sticky bars, drawers and popovers use
  one translucent recipe with a 1px inset top-edge light — that single line is
  what stops them looking flat against the field.
- **The background stays still.** One fixed ambient glow (`.ob-ambient::before`)
  sits behind the app and retints from the live theme tokens. The curl-noise flow
  field that used to drift behind every route is gone — a 620-stroke canvas
  repainting each frame cost more smoothness than it gave back in atmosphere.
- Desktop-first workspace, responsive tablet/mobile, and motion that defers to
  `prefers-reduced-motion` in both CSS and JS.

## Tokens

All in `src/app/globals.css` as `--ob-*` variables. Dark is the default field
(`:root`); `[data-theme="light"]` is the paper companion. Theme switching follows
the `data-theme` attribute, never the OS preference, and `color-scheme` flips
with it so native date pickers, select menus and scrollbars stay in the family.

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--ob-bg` | `#06120d` | `#f1f5ee` | page field |
| `--ob-surface` | `#0d2018` | `#fbfdf8` | glass base |
| `--ob-leaf` | `#5fd68a` | `#16794a` | action / emphasis |
| `--ob-leaf-ink` | `#04210f` | `#f2fff6` | text on leaf |
| `--ob-sand` | `#d2c391` | `#8a6a1c` | discount / meta / warning |
| `--ob-red` | `#ff4d5a` | `#b3242c` | danger |
| `--ob-text` | `#eaf3ec` | `#0a1a12` | ink |
| `--ob-muted` | `#98b3a3` | `#4a6a57` | secondary ink |
| `--ob-line` | `rgb(190 235 205 / .14)` | `rgb(12 58 36 / .14)` | hairline |

**Derivation is mandatory.** Every other colour is a `color-mix()` off the table
above — tints (`--ob-tint-wash/hover/badge`), borders, the sidebar, ambient
glow, shadows. No component may hardcode a colour; if a shade is missing, mix a
new token rather than writing a literal.

The light theme is not an inversion: `--ob-leaf` darkens until it holds contrast
on paper, ink takes the dark field colour, and `--ob-inset-light` flips from a
pale green edge to a white one.

### Glass

```css
--ob-glass:         color-mix(in srgb, var(--ob-surface) 82%, transparent);
--ob-glass-strong:  color-mix(in srgb, var(--ob-surface) 96%, transparent);
backdrop-filter: blur(18px) saturate(150%);
box-shadow: inset 0 1px 0 rgb(190 235 205 / 0.07);
```

`.ob-glass-bar` is the ready-made version for sticky chrome (workspace header,
POS bill bar, chart tooltip) — it also emits the `-webkit-backdrop-filter` twin
that Tailwind cannot.

### Overlays

One scrim field everywhere, never `bg-black/40`: `--ob-scrim-bg` plus
`blur(3px)`. `.ob-scrim` is the animated close-target behind a modal; `.ob-veil`
is the same field without the entry animation, for the container that holds the
modal itself (command palette, mobile cart sheet, native `<dialog>`).

### Type roles

Layered as `@layer components` so a call-site utility (`text-sm`,
`tracking-tight`) can still win over the default treatment.

| Class | Treatment |
| --- | --- |
| `.ob-label` | Instrument 600, 12px, `.14em`, uppercase, **leaf** — opens sections, tags meta |
| `.ob-label-quiet` | same, 11px, `.16em`, muted — table heads, secondary meta |
| `.ob-sec-label` | `NN / Name` with a trailing hairline |
| `.ob-lead` | muted intro line, `--fs-lead`, capped measure |
| `.ob-num` | Bricolage + `tabular-nums` — every price, count and metric |
| `.ob-h1-cap` / `.ob-h2-cap` | display caps for hero and section headings |
| `.ob-fineprint` | 14px, `.04em`, muted, leaf underline on links |

Table heads inherit `.ob-label-quiet` through `.ob-card thead th`, so a single
column can still be restyled at the call site.

### Shape scale

`@theme` remaps Tailwind's `--radius-*` to the botanical scale, so the ~250
scattered `rounded-*` classes inherit one decision instead of five.

`xs 14 · sm 16 · md 20 · lg 26 · xl 28 · 2xl 30 · pill 999`

Anything pressable, selectable or taggable is `rounded-full`. Icon buttons are
circles. The only non-pill interactive exception is the tab *island* track, which
is a pill containing pill children.

### Motion

`@keyframes`: `ob-glare`, `ob-fade-in`, `ob-rise`, `ob-slide-in`, `ob-scrim`,
`ob-flip-in`, `ob-pop`, `ob-drop`, `ob-grow-bar`, `ob-caret`.

**A — Glare sweep.** `.ob-glare` / `.ob-glare-top`: a blurred light band
(`blur(9px)`, rotated) passes *behind* the card content on hover/focus,
`translate -150% → 320%` over `.85s linear`. Core is
`--ob-glare-core: color-mix(sand 70%, #ffffff)`.

**B — Card lift + border warm-up.** `.ob-card` transitions `border-color .25s,
transform .25s`, lifts 3–4px and mixes its border toward leaf. Row hover is a
leaf wash (`--ob-tint-hover`), never a grey, and the dash bullets brighten to
leaf with it.

**C — Island pills with a shared spring.** Nav, tabs and segmented controls put a
leaf pill behind the active label and slide it with a `layoutId` spring
`{ type: "spring", stiffness: 420, damping: 34, mass: 0.7 }`. Used by the sidebar
active item (`ob-nav-active`), `Tabs` (`ob-tab-active-{label}`),
`SegmentedControl` (`ob-segment-active-{label}`) and `ManagerSubnav`
(`ob-manager-tab-active`). Panels use `{ stiffness: 460, damping: 34 }`.

**D — Wordmark, held still.** Each letter of `Order`+`Book` is still its own
span, now with a static two-tone instead of a wave: `Order` in `--ob-leaf`,
`Book` in `--ob-crest` (`#0b5c33` on paper, white on dark). The `ob-wave` /
`ob-crest` loop on the header mark and the `ob-fwave` loop on the giant footer
mark are gone — they ran for the life of the page and pulled the eye off the
data. The footer mark keeps its `--mark-w` sizing and the mask that sinks it
through the bottom edge. `LogoMark` is static markup too: no rotation on
showcase surfaces, no pulsing rings in the sidebar.

**Other timings.** Entrance `ob-rise` 1s from `translateY(28px)`, staggered
`0/.1/.2/.3/.35s` via `.ob-stagger > *`. Typewriter (landing hero): 55ms per
character in, 1900ms hold, 26ms per character out, 220ms between words, with a 3px
leaf caret and a reserved `min-height` so the heading never jumps.

`@media (prefers-reduced-motion: reduce)` kills all animation and transitions
and zeroes the hover transforms; the JS side (`useReducedMotion`) renders static
instead.

### Background field

`.ob-workspace` paints the flat `--ob-bg` tone and `.ob-ambient::before` adds one
fixed 28rem radial glow in the bottom-right, driven by `--ob-glow` so it follows
the theme. Nothing else moves behind the app: the flow-field canvas and its
`--ob-flow-leaf` / `--ob-flow-sand` / `--ob-flow-fade` intensity tokens were
removed because the per-frame full-viewport repaint made scrolling and typing
feel heavy.

### Data viz

`--ob-series-1…8` stays inside the family — leaf and sand, then mixes between the
two and toward ink or muted. Only one deep tone per theme, so no series
disappears into the field, and hue never outshouts `--ob-leaf`. Recharts consumes
the variables directly, so charts retint on theme change with no JS.

The area/line bloom is `drop-shadow(0 0 9px color-mix(series 45%, transparent))`.

## Components

Reusable patterns under `src/components/ui/`, shell under
`src/components/shell/`, effects under `src/components/effects/`.

| Primitive | Shape |
| --- | --- |
| `Button` | pill, `px-6 py-2.5 text-[15px] 600`, gap 8. `ob-press` lifts `-1px` and dips `+1px scale(.97)` on press. `primary` = `ob-btn-primary` (leaf gradient that slides on hover + `--ob-leaf-glow`); `secondary` = `--ob-tint-wash` fill with `--ob-border-strong`; `ghost` = `ob-btn-ghost` (transparent, 1px `--ob-border`, leaf border + wash on hover); `danger` = red with `--ob-danger-ink` |
| `Badge` | pill micro-label, 11px/`.13em` uppercase, tone tinted via `color-mix` on background, text and ring |
| `Tabs` / `SegmentedControl` | pill island track + sliding leaf pill |
| `StatCard` | glass card, `.ob-label-quiet` label, `.ob-num` metric at `clamp(26px, 2.4vw, 34px)`, tone pill hint |
| `Card` | `.ob-card` glass, lift on hover, glare on `.ob-glare` |
| `EmptyState` | dashed `--ob-line-hover` border on `--ob-glass-strong`, 26px radius |
| `Input` | `.ob-input` — glass fill, 1px hairline, `--ob-radius-xs` (14px), border warms to `--ob-border-strong` on hover and to leaf on focus |

Workspace chrome: the sidebar is one shade darker than the page
(`--ob-sidebar: #08180f`) and translucent; the header is `.ob-glass-bar`. The
page title group is `sm:shrink-0` and the action group `flex-wrap`s first, so
actions compress before the title truncates.

Horizontal strips (`.ob-scroll-x`) scroll with a 6px hairline thumb and no track
instead of a browser-default gutter.

The quotation / bill builder is the one fit-to-viewport screen: from `lg` up each
column is `calc(100dvh - 7.125rem)` (header + top padding + bottom gutter), so
the page itself never scrolls and the catalog and cart each scroll their own
overflow. The catalog is a single `auto-fill` grid —
`minmax(min(170px, 45%), 1fr)` columns, `minmax(210px, 1fr)` rows, `min-h-full` —
which packs the width with no empty cells and lets short result sets stretch to
the full panel height. Category is a chip row plus a label on each tile rather
than separate banded sections.

## Deviations from the handoff

- The spec is a single-page marketing site with a fixed floating island nav;
  OrderBook is a sidebar workspace. The *system* was ported — glass, leaf pills,
  type roles, motion timings, scrim field — onto the existing information
  architecture rather than replacing it.
- `--fs-hero` (`clamp(40px, 6vw, 76px)`) is added for in-app hero headings; the
  spec's `.hero-in h1` size is tuned for a 100vh marketing fold and is too large
  for a workspace page title.
- The spec's mega-panel/flyout hover nav and the desktop "lamp" hero light were
  not ported: the first has no analogue in a sidebar IA, and the second is a
  hero-only decoration that would fight the flow field.
- `.ob-tag-*` stock tints keep their old `navy/teal/amber/violet/slate` ordering
  but are renamed `leaf-faint / leaf / sand / leaf-strong / muted`; every value
  is a leaf/sand/muted mix, and no hue outside the family survives.
