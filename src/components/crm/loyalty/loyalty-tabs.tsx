import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The four views of the loyalty screen. Tabs live in the URL (`?tab=`) rather
 * than in client state, so a tab is shareable and the back button returns to
 * the one you were on — the same rule the rest of the CRM follows.
 */
export const LOYALTY_TABS = [
  { id: "overview", label: "Overview", description: "Tiers, points outstanding and what they are worth." },
  { id: "accounts", label: "Accounts", description: "Balances, tiers and the points ledger." },
  { id: "memberships", label: "Memberships", description: "Plans this business runs, by customer." },
  { id: "settings", label: "Settings", description: "This brand's own earn rate, value, expiry and tiers." },
] as const;

export type LoyaltyTab = (typeof LOYALTY_TABS)[number]["id"];

export function loyaltyTabFor(value: string | undefined | null): LoyaltyTab | null {
  const trimmed = value?.trim();
  return LOYALTY_TABS.some((tab) => tab.id === trimmed)
    ? (trimmed as LoyaltyTab)
    : null;
}

export function LoyaltyTabs({
  tab,
  customerId,
}: {
  tab: LoyaltyTab;
  /** Kept on the Accounts link so a 360° deep link survives a tab change. */
  customerId: string | null;
}) {
  const hrefFor = (id: LoyaltyTab) => {
    const params = new URLSearchParams();
    if (id !== "overview") params.set("tab", id);
    if (customerId && id === "accounts") params.set("customer", customerId);
    const qs = params.toString();
    return qs ? `/customers/loyalty?${qs}` : "/customers/loyalty";
  };

  return (
    <nav
      aria-label="Loyalty"
      className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max gap-1 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-1">
        {LOYALTY_TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <Link
              key={entry.id}
              href={hrefFor(entry.id)}
              title={entry.description}
              aria-current={active ? "page" : undefined}
              className={cn(
                "ob-touch-target inline-flex items-center whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-[var(--ob-surface)] font-semibold text-[var(--crm-leaf)] shadow-sm"
                  : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {entry.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
