/**
 * The Manager sub-modules, in nav order.
 *
 * Five screens, each one a tab on the Manager subnav. Two of them carry more
 * than one job, because the alternative was two more tabs for the same
 * audience: Staff also holds the shift rota, and Meetings & Visits holds both
 * the booked meetings and the field visits a team makes.
 *
 * The enquiry pipeline is deliberately absent — leads are a CRM concern and
 * live under `/customers/leads`. `/manager/leads` still redirects there.
 */
export const MANAGER_MODULES = [
  {
    key: "staff",
    label: "Staff & Schedules",
    href: "/manager/staff",
  },
  {
    key: "meetings",
    label: "Meetings & Visits",
    href: "/manager/meetings",
  },
  {
    key: "tasks",
    label: "Tasks & Activities",
    href: "/manager/tasks",
  },
  {
    key: "purchasing",
    label: "Purchasing & Vendors",
    href: "/manager/purchasing",
  },
  {
    key: "payments",
    label: "Payments",
    href: "/manager/payments",
  },
] as const;

export type ManagerModule = (typeof MANAGER_MODULES)[number];
export type ManagerModuleKey = ManagerModule["key"];

export function isManagerModuleKey(value: string): value is ManagerModuleKey {
  return MANAGER_MODULES.some((m) => m.key === value);
}

export function visibleManagerModules(
  hidden: readonly string[],
): ManagerModule[] {
  return MANAGER_MODULES.filter((m) => !hidden.includes(m.key));
}

/**
 * Stored prefs outlive module lists — a key removed from the nav (an old
 * `visits` or `schedules` hide, say) simply drops out instead of sticking
 * around as a phantom.
 */
export function parseHiddenManagerModules(raw: unknown): ManagerModuleKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (v): v is ManagerModuleKey => typeof v === "string" && isManagerModuleKey(v),
  );
}
