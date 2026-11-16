import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { daysQuiet } from "@/lib/crm/directory";
import { isAtRisk, isDormant, type CustomerProfile } from "@/lib/crm/metrics";
import type { DirectoryPage } from "@/lib/crm/directory";

/**
 * The directory grid. Everything here is a rollup of the same order rows
 * Billing writes, so a number on this page and the same number on an invoice
 * are computed by the same function — see `lib/crm/metrics.ts`.
 */

function health(profile: CustomerProfile) {
  if (profile.status === "archived") return { tone: "neutral" as const, label: "Archived" };
  if (profile.dues > 0) return { tone: "danger" as const, label: "Owing" };
  if (isDormant(profile)) return { tone: "warning" as const, label: "Dormant" };
  if (isAtRisk(profile)) return { tone: "warning" as const, label: "At risk" };
  if (profile.daysSinceJoin <= 30) return { tone: "success" as const, label: "New" };
  return { tone: "success" as const, label: "Active" };
}

function quiet(profile: CustomerProfile, now: Date): string {
  const days = daysQuiet(profile, now);
  if (days === null) return "never bought";
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function DirectoryTable({
  page,
  currencyCode,
  now,
}: {
  page: DirectoryPage;
  currencyCode: string;
  now: Date;
}) {
  if (page.rows.length === 0) {
    return (
      <EmptyState
        title="Nobody matches these filters"
        description="Widen the health filter, clear a rule, or add the customer first."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {page.rows.map((p) => {
          const signal = health(p);
          return (
            <li key={p.customer.id}>
              <Link
                href={`/customers/${p.customer.id}`}
                className="ob-card block p-4 text-sm hover:border-[var(--ob-line-hover)]"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.customer.name}</span>
                  <Badge tone={signal.tone}>{signal.label}</Badge>
                </span>
                <span className="mt-1 block text-[var(--ob-text-muted)]">
                  {p.customer.phone ?? p.customer.email ?? "no contact on file"}
                </span>
                <span className="mt-2 block">
                  <span className="ob-num font-medium">
                    {formatMoney(p.lifetimeValue, currencyCode)}
                  </span>
                  <span className="text-[var(--ob-text-muted)]">
                    {" "}
                    across {p.orders} {p.orders === 1 ? "paid bill" : "paid bills"} · last{" "}
                    {quiet(p, now)}
                  </span>
                </span>
                {p.dues > 0 ? (
                  <span className="mt-1 block text-[var(--ob-danger)]">
                    Owes {formatMoney(p.dues, currencyCode)}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3 text-right">Paid bills</th>
              <th className="px-4 py-3 text-right">Lifetime</th>
              <th className="px-4 py-3 text-right">Outstanding</th>
              <th className="px-4 py-3">Last purchase</th>
              <th className="px-4 py-3 text-right">Rating</th>
              <th className="px-4 py-3 text-right">Points</th>
              <th className="px-4 py-3">Tags</th>
            </tr>
          </thead>
          <tbody>
            {page.rows.map((p) => {
              const signal = health(p);
              return (
                <tr key={p.customer.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/customers/${p.customer.id}`}
                      className="font-medium text-[var(--ob-primary)] hover:underline"
                    >
                      {p.customer.name}
                    </Link>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {p.customer.phone ?? "—"}
                      {p.customer.email ? ` · ${p.customer.email}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={signal.tone}>{signal.label}</Badge>
                  </td>
                  <td className="ob-num px-4 py-3 text-right align-top">{p.orders}</td>
                  <td className="ob-num px-4 py-3 text-right align-top whitespace-nowrap">
                    {formatMoney(p.lifetimeValue, currencyCode)}
                  </td>
                  <td
                    className={`ob-num px-4 py-3 text-right align-top whitespace-nowrap ${
                      p.dues > 0 ? "text-[var(--ob-danger)]" : ""
                    }`}
                  >
                    {p.dues > 0 ? formatMoney(p.dues, currencyCode) : "—"}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {p.lastOrderAt ? quiet(p, now) : "—"}
                  </td>
                  <td className="ob-num px-4 py-3 text-right align-top">
                    {p.avgRating === null ? "—" : `${p.avgRating.toFixed(1)} (${p.reviewCount})`}
                  </td>
                  <td className="ob-num px-4 py-3 text-right align-top">
                    {p.loyaltyPoints || "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.tags.length === 0 ? (
                      "—"
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="ob-tag ob-tag-leaf">
                            {tag}
                          </span>
                        ))}
                        {p.tags.length > 3 ? (
                          <span className="text-xs text-[var(--ob-text-muted)]">
                            +{p.tags.length - 3}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
