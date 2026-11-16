/**
 * CRM navigation — the section list behind both the sidebar children of
 * "Customers" and the CRM sub-nav strip.
 *
 * One array so a new CRM screen cannot appear in one place and not the other.
 * Routes live under `/customers` because the CRM is the customer side of the
 * same workspace; `/customers` itself is the CRM overview.
 */
export type CrmSectionKey =
  | "overview"
  | "directory"
  | "leads"
  | "interactions"
  | "reviews"
  | "segments"
  | "campaigns"
  | "loyalty";

export type CrmSection = {
  key: CrmSectionKey;
  href: string;
  label: string;
  /** One-line description used by the sub-nav title attribute and empty states. */
  description: string;
};

export const CRM_SECTIONS: readonly CrmSection[] = [
  {
    key: "overview",
    href: "/customers",
    label: "Overview",
    description:
      "Customers, pipeline, campaigns and service health in one deterministic snapshot.",
  },
  {
    key: "directory",
    href: "/customers/directory",
    label: "Customers",
    description:
      "Every customer with spend, status, tags, consent and a 360° profile page.",
  },
  {
    key: "leads",
    href: "/customers/leads",
    label: "Leads",
    description:
      "The enquiry pipeline: New, Site Visit, Quote Sent, Negotiating, Won, Lost.",
  },
  {
    key: "interactions",
    href: "/customers/interactions",
    label: "Interactions",
    description:
      "Calls, messages, meetings and visits logged against a customer or a lead.",
  },
  {
    key: "reviews",
    href: "/customers/reviews",
    label: "Reviews",
    description:
      "Review inbox with ratings, sentiment, replies and complaint escalation.",
  },
  {
    key: "segments",
    href: "/customers/segments",
    label: "Segments",
    description:
      "Saved audiences, recomputed from real orders, reviews and loyalty data.",
  },
  {
    key: "campaigns",
    href: "/customers/campaigns",
    label: "Campaigns",
    description:
      "Offers and announcements aimed at a segment, with consent honoured.",
  },
  {
    key: "loyalty",
    href: "/customers/loyalty",
    label: "Loyalty",
    description:
      "Points, tiers and memberships, driven by this brand's own configuration.",
  },
] as const;

export function crmSectionForPath(pathname: string): CrmSection | undefined {
  if (pathname === "/customers") {
    return CRM_SECTIONS.find((section) => section.key === "overview");
  }
  // Longest match first so /customers/directory wins over /customers.
  const matches = CRM_SECTIONS.filter(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  ).sort((a, b) => b.href.length - a.href.length);
  // A real screen wins; anything else under /customers/ is a customer profile.
  return matches[0] ?? CRM_SECTIONS.find((section) => section.key === "directory");
}

/**
 * Sidebar children — the CRM sections minus the overview, because the parent
 * "Customers" link already points at `/customers`, which *is* the overview.
 */
export function crmNavChildren(): { href: string; label: string }[] {
  return CRM_SECTIONS.filter((section) => section.key !== "overview").map(
    (section) => ({ href: section.href, label: section.label }),
  );
}
