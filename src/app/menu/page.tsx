import type { Metadata } from "next";
import { BreweryCafe } from "@/brand_sites/brewery-cafe/components/BreweryCafe";
import { loadSiteContent } from "@/brand_sites/brewery-cafe/site/data";

/**
 * The Brewery Cafe public site, served by the same app that runs its counter.
 * It reads the catalog live, so the board, the prices and the offers on this
 * page are the ones Billing will charge — and an order placed here shows up in
 * Orders the moment it is sent.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await loadSiteContent();
  return {
    title: `${brand.name} — order ahead`,
    description:
      "The board as it is stocked today, straight from the counter. Build a tray and send it through; pay when you collect.",
  };
}

export default async function BrandSitePage() {
  const { brand, groups, voices, hours, open } = await loadSiteContent();
  return (
    <BreweryCafe
      brand={brand}
      groups={groups}
      voices={voices}
      hours={hours}
      open={open}
    />
  );
}
