/**
 * The CRM sub-modules, in the order the sidebar and subnav show them.
 *
 * One entry per route under `/customers`. The Customer 360 (`/customers/[id]`)
 * is deliberately absent: it is a record, not a module, so it never appears in
 * the nav.
 */
export const CRM_MODULES = [
  {
    key: "directory",
    label: "Customers",
    href: "/customers/directory",
    description: "The book of people you bill — search, tags, custom fields, import.",
  },
  {
    key: "leads",
    label: "Leads",
    href: "/customers/leads",
    description: "Enquiries on the board, from first contact to won or lost.",
  },
  {
    key: "interactions",
    label: "Interactions",
    href: "/customers/interactions",
    description: "Every call, visit and message, with the follow-ups they created.",
  },
  {
    key: "reviews",
    label: "Reviews",
    href: "/customers/reviews",
    description: "Ratings and comments, unanswered ones first.",
  },
  {
    key: "segments",
    label: "Segments",
    href: "/customers/segments",
    description: "Saved rules that group customers from live data.",
  },
  {
    key: "campaigns",
    label: "Campaigns",
    href: "/customers/campaigns",
    description: "Who gets messaged, what offer applies, what came back.",
  },
  {
    key: "loyalty",
    label: "Loyalty",
    href: "/customers/loyalty",
    description: "Points, tiers and memberships on the rules this brand chose.",
  },
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];
export type CrmModuleKey = CrmModule["key"];

export function isCrmModuleKey(value: string): value is CrmModuleKey {
  return CRM_MODULES.some((m) => m.key === value);
}

export function crmModuleByKey(key: CrmModuleKey): CrmModule {
  const found = CRM_MODULES.find((m) => m.key === key);
  if (!found) throw new Error(`Unknown CRM module ${key}`);
  return found;
}

/** Subnav tabs: the overview plus every module. */
export const CRM_NAV_TABS: readonly { href: string; label: string }[] = [
  { href: "/customers", label: "Overview" },
  ...CRM_MODULES.map((m) => ({ href: m.href, label: m.label })),
];
