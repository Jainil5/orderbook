import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * Which business the public website belongs to. The page renders this brand's
 * catalog and its orders land in this brand's Orders screen, so the site and
 * the counter can never disagree about what is on the menu.
 */
export const SITE_BRAND_CODE: DemoBrandCode = "BR-1";

export type SiteBrand = {
  code: DemoBrandCode;
  name: string;
  currencyCode: string;
  taxRatePercent: number;
  contactEmail: string | null;
  contactPhone: string | null;
};

/** Money and contact details the site quotes, read from the brand's own row. */
export function siteBrand(): SiteBrand {
  const pack = getDemoBrandPack(SITE_BRAND_CODE);
  return {
    code: SITE_BRAND_CODE,
    name: pack.brand.name,
    currencyCode: pack.settings.currency_code ?? "INR",
    taxRatePercent: pack.settings.tax_rate_percent ?? 0,
    contactEmail: pack.settings.contact_email ?? null,
    contactPhone: pack.settings.contact_phone ?? null,
  };
}
