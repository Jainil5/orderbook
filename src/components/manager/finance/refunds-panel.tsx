"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  refundsByMethod,
  refundsByStatus,
  refundsTotal,
  type RefundRow,
  type RefundStatus,
} from "@/lib/business/cash";
import { formatDate, formatMoney } from "@/lib/format";

type StatusFilter = RefundStatus | "all";

function statusOptions(
  rows: RefundRow[],
): { id: StatusFilter; label: string }[] {
  return [
    { id: "all", label: `All (${rows.length})` },
    { id: "requested", label: `Requested (${rows.filter((r) => r.status === "requested").length})` },
    { id: "processed", label: `Paid out (${rows.filter((r) => r.status === "processed").length})` },
  ];
}

/**
 * Refunds as the records show them. A refund exists either as an explicit
 * refund record (a request raised from an order) or as a negative payment (the
 * money that actually left). Status is read from those two: a request becomes
 * "paid out" once a negative payment covers it. Nothing here changes an order —
 * refunds are still recorded from the order screen.
 */
export function RefundsPanel({
  rows,
  currencyCode,
  rangeLabel,
}: {
  rows: RefundRow[];
  currencyCode: string;
  rangeLabel: string;
}) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const money = (value: number) => formatMoney(value, currencyCode);
  const visible = rows.filter((row) => (status === "all" ? true : row.status === status));
  const methods = refundsByMethod(rows);

  return (
    <div className="space-y-4">
      <div className="ob-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        {refundsByStatus(rows).map((bucket) => (
          <Card key={bucket.status} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              {bucket.status === "requested" ? "Awaiting payout" : "Paid out"}
            </p>
            <p className="mt-1 text-2xl font-semibold">{money(bucket.total)}</p>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              {bucket.count} refund{bucket.count === 1 ? "" : "s"}
            </p>
          </Card>
        ))}
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
            Total refunded
          </p>
          <p className="mt-1 text-2xl font-semibold">{money(refundsTotal(rows))}</p>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">{rangeLabel}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
            Paid out only
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {money(refundsTotal(rows, true))}
          </p>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Money that has left the business
          </p>
        </Card>
      </div>

      {methods.length > 0 ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Refunded by method</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {methods.map((entry) => (
              <li
                key={entry.method}
                className="rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2"
              >
                <p className="text-xs text-[var(--ob-text-muted)]">
                  {entry.method} · {entry.count}
                </p>
                <p className="font-medium">{money(entry.total)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-4">
        <SegmentedControl
          label="Refund status"
          value={status}
          onChange={setStatus}
          options={statusOptions(rows)}
        />
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length ? "No refunds match this filter" : "No refunds recorded"}
          description={
            rows.length
              ? "Switch the status filter to see the rest of the refund list."
              : "Refunds are raised from an order — void it or record a refund on the order page and it appears here. This screen only reports refunds, it does not create them."
          }
        />
      ) : (
        <>
          <div className="ob-scroll-x ob-card hidden md:block">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">
                Refund amount, method, status and date per refund
              </caption>
              <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Raised</th>
                  <th className="px-4 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--ob-border)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${row.orderId}`}
                        className="text-[var(--ob-primary)] hover:underline"
                      >
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.customerName ?? "Walk-in"}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {money(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-[var(--ob-text-muted)]">
                      {row.method}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={row.status === "processed" ? "success" : "warning"}>
                        {row.status === "processed" ? "paid out" : "requested"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--ob-text-muted)]">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-[var(--ob-text-muted)]">
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visible.map((row) => (
              <li key={row.id} className="ob-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${row.orderId}`}
                      className="font-medium text-[var(--ob-primary)]"
                    >
                      {row.orderNumber}
                    </Link>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {row.customerName ?? "Walk-in"} · {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{money(row.amount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ob-text-muted)]">
                  <Badge tone={row.status === "processed" ? "success" : "warning"}>
                    {row.status === "processed" ? "paid out" : "requested"}
                  </Badge>
                  <span>{row.method}</span>
                  {row.reason ? <span>· {row.reason}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
