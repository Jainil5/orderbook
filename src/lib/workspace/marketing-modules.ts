/**
 * The Content & Ads sub-modules, in the order the sidebar and subnav show them.
 *
 * One entry per route under `/marketing`. Unlike the CRM there is no overview
 * page: the two screens are the module, so `/marketing` redirects to the first
 * one.
 */
export const MARKETING_MODULES = [
  {
    key: "ads",
    label: "Digital Ads",
    href: "/marketing/ads",
    description: "Paid and owned digital campaigns on file, with what they returned.",
  },
  {
    key: "content",
    label: "Content Management",
    href: "/marketing/content",
    description: "Reel scripts and photo-post ideas from the products you sell.",
  },
  {
    key: "signals",
    label: "Growth Signals",
    href: "/marketing/signals",
    description: "What is moving, what people keep asking, and what actually sold.",
  },
] as const;

export type MarketingModule = (typeof MARKETING_MODULES)[number];
export type MarketingModuleKey = MarketingModule["key"];

export function isMarketingModuleKey(value: string): value is MarketingModuleKey {
  return MARKETING_MODULES.some((m) => m.key === value);
}

export function marketingModuleByHref(pathname: string): MarketingModule | null {
  return MARKETING_MODULES.find((m) => m.href === pathname) ?? null;
}

/** Subnav tabs. */
export const MARKETING_NAV_TABS: readonly { href: string; label: string }[] =
  MARKETING_MODULES.map((m) => ({ href: m.href, label: m.label }));
