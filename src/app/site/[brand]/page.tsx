import { notFound } from "next/navigation";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  buildMenuSections,
  buildSiteStats,
  buildTestimonials,
  resolveSet,
  siteOffers,
  type SiteMenuItem,
} from "@/lib/site/menu";
import { siteProfile } from "@/lib/site/registry";
import { MenuBrowser } from "@/components/site/menu-browser";
import { SiteHero } from "@/components/site/site-hero";
import { SiteReveal } from "@/components/site/site-chrome";
import {
  SiteJournal,
  SiteRule,
  SiteStory,
  SiteVisit,
  SiteVoices,
} from "@/components/site/site-editorial";
import { SiteSetBlock } from "@/components/site/site-set";
import { formatMoney } from "@/lib/format";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export const dynamic = "force-dynamic";

/**
 * The brand website's first tab, in the order the reference sites put it:
 * statement → the card → the room → the set → voices → notes → visit. Only
 * the copy is authored here; every line, price, count, badge and review on
 * the page is read from the brand's own CSV pack.
 */
export default async function SiteHomePage({
  params,
}: PageProps<"/site/[brand]">) {
  const { brand } = await params;
  const profile = siteProfile(brand);
  if (!profile) notFound();

  const code = profile.code as DemoBrandCode;
  const pack = getDemoBrandPack(code);
  const sections = buildMenuSections(pack.products, pack.orderItems, profile);
  const stats = buildSiteStats(pack.products, pack.orders, pack.reviews);
  const testimonials = buildTestimonials(pack.reviews);
  const offers = siteOffers(pack.offers);
  const set = resolveSet(sections, profile);
  const currencyCode = pack.settings.currency_code;

  // The hero floats the most-ordered pieces with a photo — chosen from the
  // pack's own order history, not hand-picked.
  const featured: SiteMenuItem[] = sections
    .flatMap((section) => section.items)
    .filter((item) => item.popular && item.imageUrl)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);
  const fallbackFeatured = sections
    .flatMap((section) => section.items)
    .filter((item) => item.imageUrl)
    .slice(0, 3);
  const heroItems = featured.length ? featured : fallbackFeatured;

  return (
    <>
      <SiteHero
        profile={profile}
        stats={stats}
        featured={heroItems}
        currencyCode={currencyCode}
      />

      {offers.length ? (
        <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <SiteReveal>
            <div className="flex flex-wrap gap-3">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  className="site-spot flex items-baseline gap-3 px-5 py-3"
                >
                  <span className="site-display text-lg text-[var(--site-accent)]">
                    {offer.code}
                  </span>
                  <span className="text-sm text-[var(--site-muted)]">
                    {offer.name} —{" "}
                    {offer.discount_type === "percent"
                      ? `${offer.discount_value}% off`
                      : `${formatMoney(offer.discount_value, currencyCode)} off`}
                    {offer.min_order_amount
                      ? ` on ${offer.scope === "category" ? `${offer.scope_value} orders` : "orders"} over ${formatMoney(offer.min_order_amount, currencyCode)}`
                      : offer.scope === "category"
                        ? ` on ${offer.scope_value}`
                        : ""}
                    {offer.max_discount
                      ? ` · max ${formatMoney(offer.max_discount, currencyCode)}`
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </SiteReveal>
        </section>
      ) : null}

      <div className="mt-16 sm:mt-20">
        <MenuBrowser
          sections={sections}
          profile={profile}
          currencyCode={currencyCode}
        />
      </div>

      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
        <SiteRule
          id="room"
          kicker={profile.madeToOrder ? "The workshop" : "The room"}
          title={profile.storyTitle}
          intro={profile.storyBody}
        />
        <div className="mt-10">
          <SiteStory profile={profile} />
        </div>
      </section>

      {set.courses.length ? (
        <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
          <SiteRule
            id="set"
            kicker={profile.set.kicker}
            title={profile.set.statement}
            count={`${set.courses.length} ${profile.summaryWords.lines} · ${
              set.dropped.length
                ? `${set.dropped.length} off the card today`
                : "all on the card today"
            }`}
          />
          <div className="mt-10">
            <SiteSetBlock
              profile={profile}
              set={set}
              currencyCode={currencyCode}
            />
          </div>
        </section>
      ) : null}

      {testimonials.length ? (
        <section
          id="voices"
          className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6"
        >
          <SiteVoices profile={profile} testimonials={testimonials} />
        </section>
      ) : null}

      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
        <SiteReveal>
          <SiteJournal profile={profile} />
        </SiteReveal>
      </section>

      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:px-6">
        <SiteRule
          id="visit"
          kicker={profile.visitKicker}
          title={profile.visitTitle}
          count={profile.hours}
        />
        <div className="mt-10">
          <SiteVisit
            profile={profile}
            contactEmail={pack.settings.contact_email ?? null}
            contactPhone={pack.settings.contact_phone ?? null}
          />
        </div>
      </section>
    </>
  );
}
