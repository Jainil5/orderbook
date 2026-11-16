/**
 * Manager registry — the single source of truth for the four specialized
 * managers under `/manager`, their sub-navigation sections, and the
 * industry presets that decide which sections a business type enables.
 *
 * Section `key`s double as the module-visibility toggle keys stored in the
 * workspace prefs cookie (see `lib/workspace/manager-modules.ts`), so keys that
 * already exist in saved prefs (staff, services, appointments, visits,
 * schedules, tasks) are reused rather than renamed.
 */

export type ManagerKey = "productivity" | "staff" | "products" | "finance";

export type ManagerSection = {
  key: string;
  label: string;
  /** Short label used in tight sub-nav rows. */
  navLabel: string;
  href: string;
  description: string;
};

export type ManagerDefinition = {
  key: ManagerKey;
  label: string;
  shortLabel: string;
  href: string;
  tagline: string;
  description: string;
  sections: ManagerSection[];
};

export const MANAGERS: ManagerDefinition[] = [
  {
    key: "productivity",
    label: "Productivity Manager",
    shortLabel: "Productivity",
    href: "/manager/productivity",
    tagline: "Manage the work",
    description:
      "Tasks, notes, a unified calendar, appointments and bookings, follow-ups and the Google Calendar and Gmail integrations that feed them.",
    sections: [
      {
        key: "tasks",
        label: "Tasks & to-dos",
        navLabel: "Tasks",
        href: "/manager/productivity/tasks",
        description:
          "Assign work with priorities, due dates, categories, recurrence and reminders.",
      },
      {
        key: "notes",
        label: "Notes",
        navLabel: "Notes",
        href: "/manager/productivity/notes",
        description:
          "Personal and shared business notes, searchable and linked to customers, staff, appointments or tasks.",
      },
      {
        key: "calendar",
        label: "Calendar & agenda",
        navLabel: "Calendar",
        href: "/manager/productivity/calendar",
        description:
          "One agenda for appointments, bookings, meetings, tasks and synced external events, with conflict detection.",
      },
      {
        key: "appointments",
        label: "Appointments & bookings",
        navLabel: "Bookings",
        href: "/manager/productivity/appointments",
        description:
          "Book customers with staff and services, reschedule, cancel and keep the full booking history.",
      },
      {
        key: "visits",
        label: "Follow-ups & activities",
        navLabel: "Activities",
        href: "/manager/productivity/activities",
        description:
          "Field visits with check-in and reports, follow-up reminders, meeting notes and pending responses.",
      },
      {
        key: "integrations",
        label: "Integrations",
        navLabel: "Integrations",
        href: "/manager/productivity/integrations",
        description:
          "Connect Google Calendar and Gmail over OAuth, review what syncs, and keep every external change confirmed.",
      },
    ],
  },
  {
    key: "staff",
    label: "Staff Manager",
    shortLabel: "Staff",
    href: "/manager/staff",
    tagline: "Manage the people",
    description:
      "Employee records, schedules and shifts, attendance and leave, workload and performance, and who can access what.",
    sections: [
      {
        key: "staff",
        label: "Staff directory",
        navLabel: "Directory",
        href: "/manager/staff/directory",
        description:
          "Profiles, contact details, roles, teams, employment status and joining dates.",
      },
      {
        key: "schedules",
        label: "Schedules & shifts",
        navLabel: "Shifts",
        href: "/manager/staff/schedules",
        description: "Weekly rota, shift assignments and who is on duty right now.",
      },
      {
        key: "attendance",
        label: "Attendance & leave",
        navLabel: "Attendance",
        href: "/manager/staff/attendance",
        description:
          "Daily attendance, late arrivals, leave requests and approvals, and availability.",
      },
      {
        key: "performance",
        label: "Performance",
        navLabel: "Performance",
        href: "/manager/staff/performance",
        description:
          "Assigned and completed tasks, workload, productivity metrics and activity history.",
      },
      {
        key: "permissions",
        label: "Roles & permissions",
        navLabel: "Permissions",
        href: "/manager/staff/permissions",
        description:
          "Employee roles, what each role can open and change, and manager vs employee access.",
      },
    ],
  },
  {
    key: "products",
    label: "Products Manager",
    shortLabel: "Products",
    href: "/manager/products",
    tagline: "Manage what you sell",
    description:
      "The product and service catalogue, stock, suppliers and purchase orders, and which lines actually make money.",
    sections: [
      {
        key: "catalogue",
        label: "Catalogue",
        navLabel: "Catalogue",
        href: "/manager/products/catalogue",
        description:
          "Products, categories, variants, pricing, descriptions and active status.",
      },
      {
        key: "services",
        label: "Services catalogue",
        navLabel: "Services",
        href: "/manager/products/services",
        description:
          "Service pricing, duration and availability, plus the service jobs they turn into.",
      },
      {
        key: "inventory",
        label: "Inventory",
        navLabel: "Inventory",
        href: "/manager/products/inventory",
        description:
          "Current stock, adjustments and movements, low-stock alerts, reorder levels and valuation.",
      },
      {
        key: "procurement",
        label: "Procurement",
        navLabel: "Procurement",
        href: "/manager/products/procurement",
        description:
          "Suppliers, purchase orders, receiving stock in and purchase history.",
      },
      {
        key: "intelligence",
        label: "Product intelligence",
        navLabel: "Insights",
        href: "/manager/products/intelligence",
        description:
          "Profitability and margin, best sellers and slow movers, dead-stock candidates.",
      },
    ],
  },
  {
    key: "finance",
    label: "Finance Manager",
    shortLabel: "Finance",
    href: "/manager/finance",
    tagline: "Manage the money",
    description:
      "Money in and out beyond the counter: receivables, refunds, expenses, cash sessions and a reconciled transaction record.",
    sections: [
      {
        key: "payments",
        label: "Payments",
        navLabel: "Payments",
        href: "/manager/finance/payments",
        description:
          "Every payment record, method, status, partial payment and history.",
      },
      {
        key: "receivables",
        label: "Receivables",
        navLabel: "Receivables",
        href: "/manager/finance/receivables",
        description:
          "Unpaid invoices, amounts due, overdue balances and customer payment history.",
      },
      {
        key: "refunds",
        label: "Refunds",
        navLabel: "Refunds",
        href: "/manager/finance/refunds",
        description: "Refund requests, processing, status and history.",
      },
      {
        key: "expenses",
        label: "Expenses",
        navLabel: "Expenses",
        href: "/manager/finance/expenses",
        description:
          "Expense records with categories and dates, recurring costs and summaries.",
      },
      {
        key: "cash",
        label: "Cash & reconciliation",
        navLabel: "Cash",
        href: "/manager/finance/cash",
        description:
          "Cash register, daily closing, inflows and outflows, and transaction reconciliation.",
      },
    ],
  },
];

export type IndustryId =
  | "cafe"
  | "restaurant"
  | "salon_spa"
  | "furniture"
  | "retail"
  | "service"
  | "general";

export type IndustryPreset = {
  id: IndustryId;
  label: string;
  /** Section keys this business type switches off by default. */
  hiddenSections: string[];
};

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  { id: "cafe", label: "Cafe", hiddenSections: [] },
  { id: "restaurant", label: "Restaurant", hiddenSections: [] },
  {
    id: "salon_spa",
    label: "Salon & spa",
    hiddenSections: ["inventory", "procurement", "intelligence"],
  },
  { id: "furniture", label: "Furniture", hiddenSections: [] },
  {
    id: "retail",
    label: "Retail store",
    hiddenSections: ["appointments", "visits", "calendar"],
  },
  {
    id: "service",
    label: "Service business",
    hiddenSections: ["catalogue", "inventory", "procurement"],
  },
  { id: "general", label: "Other / general", hiddenSections: [] },
];

export function isIndustryId(value: unknown): value is IndustryId {
  return INDUSTRY_PRESETS.some((p) => p.id === value);
}

export function getIndustryPreset(id: unknown): IndustryPreset | undefined {
  return INDUSTRY_PRESETS.find((p) => p.id === id);
}

export function getManager(key: ManagerKey): ManagerDefinition {
  const manager = MANAGERS.find((m) => m.key === key);
  if (!manager) throw new Error(`Unknown manager ${key}`);
  return manager;
}

export function isManagerKey(value: unknown): value is ManagerKey {
  return MANAGERS.some((m) => m.key === value);
}

/** Every section across every manager, in navigation order. */
export const ALL_MANAGER_SECTIONS: ManagerSection[] = MANAGERS.flatMap(
  (m) => m.sections,
);

export function managerForHref(pathname: string): ManagerDefinition | undefined {
  return MANAGERS.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );
}

export function visibleManagers(hidden: readonly string[]): ManagerDefinition[] {
  return MANAGERS.map((m) => ({
    ...m,
    sections: m.sections.filter((s) => !hidden.includes(s.key)),
  })).filter((m) => m.sections.length > 0);
}

export function visibleSections(
  key: ManagerKey,
  hidden: readonly string[],
): ManagerSection[] {
  return getManager(key).sections.filter((s) => !hidden.includes(s.key));
}

export function isKnownSectionKey(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ALL_MANAGER_SECTIONS.some((s) => s.key === value)
  );
}
