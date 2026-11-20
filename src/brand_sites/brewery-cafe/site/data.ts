import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  listDemoIngredientsMerged,
  listDemoInventoryMerged,
  listDemoProductsMerged,
} from "@/lib/demo/data";
import { SITE_BRAND_CODE, siteBrand, type SiteBrand } from "@/lib/demo/site-brand";
import { buildMenu, type MenuGroup } from "../components/menu";
import { buildVoices, type Voice } from "../components/voices";
import { cache } from "react";

export type SiteContent = {
  brand: SiteBrand;
  groups: MenuGroup[];
  voices: Voice[];
};

/**
 * Everything the public page shows is read from the same rows the counter works
 * in: the catalog, its recipes, the shelf, the brand's own settings and the
 * review inbox. There is no second menu to keep in sync.
 */
export const loadSiteContent = cache(async (): Promise<SiteContent> => {
  const pack = getDemoBrandPack(SITE_BRAND_CODE);
  const [products, inventory, ingredients] = await Promise.all([
    listDemoProductsMerged({ activeOnly: true }, SITE_BRAND_CODE),
    listDemoInventoryMerged(SITE_BRAND_CODE),
    listDemoIngredientsMerged(SITE_BRAND_CODE),
  ]);
  const brand = siteBrand();
  return {
    brand,
    groups: buildMenu({ products, inventory, ingredients, currencyCode: brand.currencyCode }),
    voices: buildVoices({
      reviews: pack.reviews,
      customers: pack.customers,
      products: pack.products,
    }),
  };
});
