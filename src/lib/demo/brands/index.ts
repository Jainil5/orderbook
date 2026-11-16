/**
 * The demo brand packs, CSV-backed.
 *
 * `getDemoBrandPack` now returns the same pack shape with record arrays read
 * from `data/*.csv` (auto-seeded from the raw fixtures on first access), so
 * every existing consumer — demo loaders, operations, staff, the AI area —
 * switches to CSV as its base data without changing call sites. The untouched
 * fixtures remain available from `./packs` (`getRawDemoBrandPack`) for seeding
 * and comparison.
 */

import { csvPackFor } from "@/lib/csv/source";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export {
  DEMO_BRAND_CODES,
  getRawDemoBrandPack,
  resolveDemoBrandCode,
  BREWERY_CAFE_DEMO,
  CUBIG_FURNITURE_DEMO,
} from "@/lib/demo/brands/packs";

export function getDemoBrandPack(code: DemoBrandCode) {
  return csvPackFor(code);
}
