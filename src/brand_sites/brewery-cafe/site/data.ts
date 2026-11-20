import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  listDemoIngredientsMerged,
  listDemoInventoryMerged,
  listDemoProductsMerged,
} from "@/lib/demo/data";
import { SITE_BRAND_CODE, siteBrand, type SiteBrand } from "@/lib/demo/site-brand";
import { resolveWorkingHours } from "@/lib/hours/resolve";
import {
  hoursRows,
  openStateAt,
  type OpenStatus,
  type WorkingHours,
} from "@/lib/hours/working-hours";
import { buildMenu, type MenuGroup } from "../components/menu";
import { buildVoices, type Voice } from "../components/voices";
import { cache } from "react";

/** One row of the opening-hours table, e.g. `{ days: "Mon–Thu", time: "7:00 – 16:00" }`. */
export type SiteHoursRow = { days: string; time: string };

/** Whether the doors are open right now — the header pill reads this. */
export type SiteOpenState = {
  status: OpenStatus;
  /** "Open now" / "Closing soon" / "Closed" */
  pill: string;
  /** The full sentence, e.g. "Open until 16:00" */
  label: string;
  /** True when the owner has flipped the availability switch off. */
  paused: boolean;
};

export type SiteContent = {
  brand: SiteBrand;
  groups: MenuGroup[];
  voices: Voice[];
  /** The schedule as rows, straight from the brand's own settings. */
  hours: SiteHoursRow[];
  open: SiteOpenState;
  /** Raw schedule, so a screen that needs the windows has them. */
  schedule: WorkingHours;
};

/**
 * Everything the public page shows is read from the same rows the counter works
 * in: the catalog, its recipes, the shelf, the brand's own settings and the
 * review inbox. There is no second menu to keep in sync — and no second set of
 * opening hours either, so the page cannot promise a table at ten when the
 * workspace has just closed the kitchen at nine.
 */
export const loadSiteContent = cache(async (): Promise<SiteContent> => {
  const pack = getDemoBrandPack(SITE_BRAND_CODE);
  const [products, inventory, ingredients, timed] = await Promise.all([
    listDemoProductsMerged({ activeOnly: true }, SITE_BRAND_CODE),
    listDemoInventoryMerged(SITE_BRAND_CODE),
    listDemoIngredientsMerged(SITE_BRAND_CODE),
    resolveWorkingHours(SITE_BRAND_CODE),
  ]);
  const brand = siteBrand();
  const state = openStateAt(timed.hours, new Date(), { paused: timed.ordersPaused });
  return {
    brand,
    groups: buildMenu({ products, inventory, ingredients, currencyCode: brand.currencyCode }),
    voices: buildVoices({
      reviews: pack.reviews,
      customers: pack.customers,
      products: pack.products,
    }),
    hours: hoursRows(timed.hours),
    schedule: timed.hours,
    open: {
      status: state.status,
      pill: state.pill,
      label: state.label,
      paused: timed.ordersPaused,
    },
  };
});
