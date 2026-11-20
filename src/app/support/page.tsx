import type { Metadata } from "next";
import { OrderLookupPanel } from "@/components/support/order-lookup";
import { siteBrand, SITE_BRAND_CODE } from "@/lib/demo/site-brand";
import { resolveWorkingHours } from "@/lib/hours/resolve";
import { openStateAt } from "@/lib/hours/working-hours";
import { POLICY_LINES } from "@/lib/support/self-serve";

/**
 * The post-purchase desk, open to anyone with a receipt.
 *
 * It sits outside the workspace on purpose: a customer has no business with a
 * login, and the two questions they have — where is my order, and what happens
 * if it was wrong — are answered here in the same breath. Everything on this
 * page is read from the brand the public site belongs to (`SITE_BRAND_CODE`)
 * and from the same schedule the till shows, so the hours and the promise about
 * when a person will answer cannot disagree with either.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = siteBrand();
  return {
    title: `${brand.name} — order support`,
    description:
      "Look up a bill by its number and the mobile it was placed on, read the returns and refunds rules, and log a missing item, a return or a refund straight onto the counter's list.",
  };
}

export default async function SupportPage() {
  const brand = siteBrand();
  const { hours, ordersPaused } = await resolveWorkingHours(SITE_BRAND_CODE);
  // Decided on the server, in the visitor's own terms: the page never guesses
  // a time in the browser, so the reply the form shows is this same answer.
  const open = openStateAt(hours, new Date(), { paused: ordersPaused });

  return (
    <main className="ob-workspace min-h-screen bg-[var(--ob-bg)] px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <p className="ob-label">{brand.name}</p>
        <h1 className="ob-h1-cap mt-3">Something wrong with an order?</h1>
        <p className="mt-3 max-w-[62ch] text-[16px] leading-relaxed text-[var(--ob-text-secondary)]">
          Find your bill below and tell us what happened. It goes straight onto the counter&apos;s
          complaint list — no phone call, no queue, and nothing is sent to you from this page.
        </p>

        <OrderLookupPanel brandName={brand.name} open={open} policy={POLICY_LINES} />

        <p className="ob-fineprint mt-8">
          OrderBook keeps this page open to the public, so a lookup only returns a bill whose number
          and mobile number both match. Everything you write stays in this demo browser.
        </p>
      </div>
    </main>
  );
}
