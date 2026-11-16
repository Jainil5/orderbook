import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { CrmChip, CrmPanel, type CrmStat } from "@/components/crm/crm-ui";
import { CrmStatRow } from "@/components/crm/crm-ui";
import { formatMoney } from "@/lib/format";
import type { CustomerStat } from "@/types/crm";
import type { Customer } from "@/types/database";

export const DIRECTORY_COLUMNS = [
  "name",
  "spend",
  "orders",
  "created",
  "last_purchase",
  "dues",
] as const;

export type DirectorySort = (typeof DIRECTORY_COLUMNS)[number];

/** Directory rows = the customer plus the number set computed for them. */
export type DirectoryRow = { customer: Customer; stat: CustomerStat | undefined };

const SORT_LABELS: Record<DirectorySort, string> = {
  name: "Name",
  spend: "Total spend",
  orders: "Orders",
  created: "Newest",
  last_purchase: "Last purchase",
  dues: "Outstanding dues",
};

export function sortDirectoryRows(rows: DirectoryRow[], sort: DirectorySort): DirectoryRow[] {
  const list = [...rows];
  switch (sort) {
    case "spend":
      return list.sort(
        (a, b) =>
          (b.stat?.totalSpend ?? 0) - (a.stat?.totalSpend ?? 0) ||
          a.customer.name.localeCompare(b.customer.name),
      );
    case "orders":
      return list.sort(
        (a, b) =>
          (b.stat?.totalOrders ?? 0) - (a.stat?.totalOrders ?? 0) ||
          a.customer.name.localeCompare(b.customer.name),
      );
    case "created":
      return list.sort((a, b) =>
        (b.customer.created_at ?? "").localeCompare(a.customer.created_at ?? ""),
      );
    case "last_purchase":
      return list.sort((a, b) =>
        (b.stat?.lastPurchaseAt ?? "").localeCompare(a.stat?.lastPurchaseAt ?? ""),
      );
    case "dues":
      return list.sort(
        (a, b) => (b.stat?.outstandingDues ?? 0) - (a.stat?.outstandingDues ?? 0),
      );
    default:
      return list.sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }
}

export function DirectorySortLinks({
  active,
  buildHref,
}: {
  active: DirectorySort;
  buildHref: (sort: DirectorySort) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-[var(--ob-text-muted)]">Sort</span>
      {DIRECTORY_COLUMNS.map((column) => (
        <Link
          key={column}
          href={buildHref(column)}
          aria-current={column === active ? "true" : undefined}
          className={
            column === active
              ? "rounded-full border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2 py-0.5 font-medium text-[var(--crm-lab-strong)]"
              : "rounded-full border border-[var(--ob-border)] px-2 py-0.5 text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
          }
        >
          {SORT_LABELS[column]}
        </Link>
      ))}
    </div>
  );
}

/** Consent is shown as data, not as a checkbox someone has to trust. */
export function ConsentChip({ customer }: { customer: Customer }) {
  if (customer.opted_out_at) {
    return <CrmChip tone="danger">opted out</CrmChip>;
  }
  if (customer.marketing_consent === "granted") {
    return <CrmChip tone="positive">consent</CrmChip>;
  }
  if (customer.marketing_consent === "declined") {
    return <CrmChip tone="neutral">declined</CrmChip>;
  }
  return <CrmChip tone="neutral">not asked</CrmChip>;
}

const STATUS_TONE: Record<CustomerStat["status"], "positive" | "warning" | "neutral"> = {
  active: "positive",
  inactive: "warning",
  archived: "neutral",
};

export function DirectoryStatRow({
  rows,
  currencyCode,
}: {
  rows: DirectoryRow[];
  currencyCode: string;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  const stats = rows.map((r) => r.stat).filter(Boolean) as CustomerStat[];
  const spend = stats.reduce((sum, s) => sum + s.totalSpend, 0);
  const dues = stats.reduce((sum, s) => sum + s.outstandingDues, 0);
  const consents: CrmStat = {
    label: "Reachable",
    value: String(
      rows.filter((r) => r.customer.marketing_consent === "granted" && !r.customer.opted_out_at)
        .length,
    ),
    hint: `of ${rows.length} shown · consent granted, not opted out`,
  };
  const shown: CrmStat[] = [
    { label: "Customers", value: String(rows.length) },
    { label: "Spend shown", value: money(spend), hint: "From posted orders" },
    {
      label: "Outstanding",
      value: money(dues),
      hint: "Unpaid balance across shown customers",
    },
    consents,
  ];
  return <CrmStatRow stats={shown} />;
}

export function CustomerDirectoryTable({
  rows,
  currencyCode,
}: {
  rows: DirectoryRow[];
  currencyCode: string;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  if (!rows.length) {
    return (
      <EmptyState
        title="No customers match these filters"
        description="Clear a filter, or add a customer from the panel above."
      />
    );
  }
  return (
    <>
      {/* Mobile: one card per customer, the three numbers that matter first. */}
      <ul className="ob-stagger space-y-3 md:hidden">
        {rows.map(({ customer, stat }) => (
          <li key={customer.id} className="ob-card p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/customers/${customer.id}`}
                className="min-w-0 truncate text-base font-semibold text-[var(--ob-primary)]"
              >
                {customer.name}
              </Link>
              <CrmChip tone={STATUS_TONE[stat?.status ?? "inactive"]}>
                {stat?.status ?? "active"}
              </CrmChip>
            </div>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              {customer.phone ?? customer.email ?? "No contact details"}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ob-text-muted)]">Orders</dt>
                <dd className="font-medium tabular-nums">{stat?.totalOrders ?? 0}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ob-text-muted)]">Spend</dt>
                <dd className="font-medium tabular-nums">
                  {money(stat?.totalSpend ?? 0)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">
              {(customer.tags ?? []).slice(0, 3).map((tag) => (
                <CrmChip key={tag}>{tag}</CrmChip>
              ))}
              <ConsentChip customer={customer} />
            </div>
          </li>
        ))}
      </ul>

      <CrmPanel title="Customers" meta={`${rows.length} shown`} className="hidden md:block">
        <div className="ob-scroll-x -mx-4 -my-4">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Spend</th>
                <th className="px-3 py-2 text-right font-medium">Dues</th>
                <th className="px-3 py-2 text-right font-medium">Points</th>
                <th className="px-3 py-2 font-medium">Last purchase</th>
                <th className="px-3 py-2 font-medium">Consent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ob-border)]">
              {rows.map(({ customer, stat }) => (
                <tr key={customer.id} className="hover:bg-[var(--ob-surface-muted)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-[var(--ob-primary)] hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {(customer.tags ?? []).slice(0, 3).map((tag) => (
                        <CrmChip key={tag}>{tag}</CrmChip>
                      ))}
                      {customer.price_tier === "wholesale" ? (
                        <CrmChip tone="ink">wholesale</CrmChip>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                      {[customer.phone, customer.email].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <CrmChip tone={STATUS_TONE[stat?.status ?? "inactive"]}>
                      {stat?.status ?? "active"}
                    </CrmChip>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {stat?.totalOrders ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(stat?.totalSpend ?? 0)}
                  </td>
                  <td
                    className={
                      stat && stat.outstandingDues > 0
                        ? "px-3 py-2 text-right font-medium tabular-nums text-[var(--crm-rust)]"
                        : "px-3 py-2 text-right tabular-nums text-[var(--ob-text-muted)]"
                    }
                  >
                    {stat && stat.outstandingDues > 0
                      ? money(stat.outstandingDues)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {stat?.loyaltyPoints ?? 0}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--ob-text-muted)]">
                    {stat?.lastPurchaseAt ? stat.lastPurchaseAt.slice(0, 10) : "Never"}
                  </td>
                  <td className="px-3 py-2">
                    <ConsentChip customer={customer} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CrmPanel>
    </>
  );
}
