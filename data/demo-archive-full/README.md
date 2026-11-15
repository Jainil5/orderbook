# Full sample data (recovery copy)

The original, bulk dataset the demo shipped with before it was compressed into
the compact showcase packs in `data/demo/`. Kept so nothing is lost if the
live packs are damaged or the bulk data is wanted again.

| Brand | Business | Orders | Order items | Payments | Customers | Products |
|-------|----------|-------:|------------:|---------:|----------:|---------:|
| `BR-1` | Brewery Cafe | 274 | 694 | 255 | 43 | 24 |
| `BR-2` | Cubig Furniture | 77 | 185 | 68 | 29 | 8 |

Same column layout, same CSV conventions, same date-rebasing as `data/demo/` —
the app could read these files unchanged. Nothing here is loaded at runtime:
`src/lib/demo/csv/load-pack.ts` only imports `data/demo/<brand>/*.csv`.

## Restore

```bash
rm -rf data/demo/BR-1 data/demo/BR-2
cp -r data/demo-archive-full/BR-1 data/demo-archive-full/BR-2 data/demo/
```

Clear the demo cookies in the browser afterwards (`ob_demo_mutable_v1`,
`ob_demo_orders_v1`) so stale per-visitor overrides from the compact packs
don't patch the restored rows.

## What restoring costs you

The compact packs are what the current lock-down contract is written against,
so the restored packs will fail these checks until they are adjusted:

- `src/lib/demo/brands/csv-pack.test.ts` — expects exactly 20 orders per brand,
  the caps in `src/lib/demo/read-only.ts` (30 orders, 15 products, 10 customers,
  30 payments) and at least 2 rows in every table. This archive has 274/77
  orders, 43/29 customers and several tables with a single row.
- The empty-state and add-control copy assumes the demo opens with data in
  every module.

If only one brand is being recovered, copy that folder alone.
