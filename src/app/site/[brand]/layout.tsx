import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  buildMenuSections,
  buildTestimonials,
  resolveSet,
  type SiteMenuItem,
} from "@/lib/site/menu";
import { siteProfile } from "@/lib/site/registry";
import { CartProvider } from "@/components/site/cart-provider";
import { SiteFooter, SiteHeader, SiteSpotlights } from "@/components/site/site-chrome";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export const dynamic = "force-dynamic";

type SiteParams = { brand: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<SiteParams>;
}): Promise<Metadata> {
  const { brand } = await params;
  const profile = siteProfile(brand);
  if (!profile) return {};
  return {
    title: `${profile.name} — ${profile.tagline}`,
    description: profile.heroBody,
  };
}

/**
 * Shared chrome for the public brand websites. The theme is one scope class
 * (`site-scope site-br1`), the cart lives in the provider, and the menu items
 * handed to it come straight from the brand's CSV pack.
 */
export default async function SiteLayout({
  children,
  params,
}: LayoutProps<"/site/[brand]">) {
  const { brand } = await params;
  const profile = siteProfile(brand);
  if (!profile) notFound();

  const pack = getDemoBrandPack(profile.code as DemoBrandCode);
  const sections = buildMenuSections(pack.products, pack.orderItems, profile);
  const items: SiteMenuItem[] = sections.flatMap((section) => section.items);
  // The anchor nav only offers sections that actually render for this brand
  // today — a retired set or an empty review inbox drops its own link.
  const present = new Set(["card", "room", "visit"]);
  if (resolveSet(sections, profile).courses.length) present.add("set");
  if (buildTestimonials(pack.reviews).length) present.add("voices");
  const nav = profile.nav.filter((section) => present.has(section.id));

  return (
    <CartProvider items={items} brandCode={profile.code}>
      <div
        className={`site-scope ${profile.themeClass} flex min-h-screen flex-col font-sans`}
      >
        <SiteSpotlights />
        <SiteHeader profile={profile} nav={nav} />
        <main className="flex-1">{children}</main>
        <SiteFooter
          profile={profile}
          nav={nav}
          contactEmail={pack.settings.contact_email ?? null}
          contactPhone={pack.settings.contact_phone ?? null}
          currencyNote={`All prices in ${pack.settings.currency_code} · GST ${pack.settings.tax_rate_percent ?? 0}% as billed at the counter`}
        />
      </div>
    </CartProvider>
  );
}
