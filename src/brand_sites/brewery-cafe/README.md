# Brewery Cafe — the brand site inside Orderbook

The cafe's public landing page, served by this app at **`/menu`**. It is not a
separate site: it renders from `src/app/menu/{layout,page}.tsx`, which call the
same loaders the workspace uses, so the board, the prices and the orders are
Orderbook's own data for brand **BR-1**.

## Where the data comes from

`site/data.ts` → `loadSiteContent()` (React-cached, so metadata and the page
share one read) pulls:

| on screen | from |
| --- | --- |
| menu sections, cards, prices, offers, sold-out | `listDemoProductsMerged` + `effectiveUnitPrice` |
| "Made with" in the item dialog | `listDemoIngredientsMerged` (the product's recipe) |
| GST rate, currency, phone, email | `brand_settings.csv` via `getDemoBrandPack` |
| the "Open until 16:00" pill and the Visit hours table | `resolveWorkingHours` + `openStateAt` / `hoursRows`, from Settings → Working hours |
| testimonials | the CRM review inbox, filtered to positive 4★+ |
| "Back to the Website" link target | `brand_website_url`, set to `/menu` |

Nothing with a number on it is typed in this folder. `components/cafe.ts` holds
only voice: tagline, story, photo captions. Opening hours used to live there
too; they now come from the brand's own settings so the page cannot promise a
table at ten when the counter has closed at nine.

Switch brand by changing `SITE_BRAND_CODE` in `src/lib/demo/site-brand.ts`.

## Ordering from the website

`components/OrderTray.tsx` prices the tray with the same helpers Billing uses
(`modifierPriceDelta`, `effectiveUnitPrice`, `computeCartTotals`), then calls
`placeSiteOrder` in `src/services/site-order-actions.ts`, which re-checks every
line server-side and writes through `submitDemoOrder`.

Two rules keep the ledger honest:

- the bill is created **unpaid** (`paymentStatus: 'pending'`) — a website order
  is settled at the counter, so the tender the visitor picks is stored as a note
  for the cashier, never as a payment;
- the visitor's name, mobile and note ride along on the order.

Demo orders live in chunked httpOnly cookies, so an order placed here shows up
in the Orders screen **in the same browser**.

## Notes for editing

- Every selector in `styles/brewery-cafe.css` is scoped under `.brewery-cafe`,
  because Turbopack runs all CSS through the Tailwind loader.
- The Instagram shelf stays hidden until real posts from this brand's own
  account go into `components/instaFeed.ts`; the app's CSP (`default-src 'self'`)
  blocks third-party frames, and someone else's handle is not content to ship.
- Reduced motion is handled in CSS, so `Reveal` needs no per-frame decisions.
