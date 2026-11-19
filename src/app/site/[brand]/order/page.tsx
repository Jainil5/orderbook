import { notFound } from "next/navigation";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { buildMenuSections, siteOffers } from "@/lib/site/menu";
import { siteProfile } from "@/lib/site/registry";
import { SiteCheckout } from "@/components/site/checkout";
import { SiteRule } from "@/components/site/site-editorial";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export const dynamic = "force-dynamic";

/** The brand website's second tab: cart, details, and one tap into OrderBook. */
export default async function SiteOrderPage({
  params,
}: PageProps<"/site/[brand]">) {
  const { brand } = await params;
  const profile = siteProfile(brand);
  if (!profile) notFound();

  const pack = getDemoBrandPack(profile.code as DemoBrandCode);
  const sections = buildMenuSections(pack.products, pack.orderItems, profile);
  const items = sections.flatMap((section) => section.items);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-8 pt-12 sm:px-6 sm:pt-16">
      <SiteRule
        id="top"
        kicker={profile.orderKicker}
        title={
          profile.madeToOrder
            ? "Your list, on the workshop desk"
            : "Your tray, on the bar rail"
        }
        count={`${items.length} ${profile.summaryWords.lines} priced`}
      />
      <div className="mt-12">
        <SiteCheckout
          profile={profile}
          items={items}
          offers={siteOffers(pack.offers)}
          currencyCode={pack.settings.currency_code}
          taxRatePercent={pack.settings.tax_rate_percent ?? 0}
        />
      </div>
    </section>
  );
}
