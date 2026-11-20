import { redirect } from "next/navigation";

/**
 * Content & Ads has no overview of its own — the two screens are the module —
 * so the sidebar parent lands on the first one.
 */
export default function MarketingIndexPage() {
  redirect("/marketing/ads");
}
