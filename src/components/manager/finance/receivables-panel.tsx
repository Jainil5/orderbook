"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  RECEIVABLE_AGE_BUCKETS,
  bucketTotals,
  totalExposure,
  type AgeBucketId,
  type CustomerHistoryRow,
  type ReceivableRow,
} from "@/lib/business/cash";
import { formatDate, formatMoney } from "@/lib/format";

type BucketFilter = AgeBucketId | "all";

function bucketOptions(): { id: BucketFilter; label: string }[] {
  return [
    { id: "all", label: "All ages" },
    ...RECEIVABLE_AGE_BUCKETS.map((bucket) => ({
      id: bucket.id as BucketFilter,
      label: bucket.label,
    })),
  ];
}

/**
 * Outstanding invoices: what is still owed, how old each balance is, and how
 * the customer behind it has paid so far. Ages and totals come from
 * `lib/business/cash.ts`, which reads the same order and payment records the
 * bill screens write.
 */
export function ReceivablesPanel({
  rows,
  history,
  currencyCode,
  overdueAfterDays,
}: {
  rows: ReceivableRow[];
  history: CustomerHistoryRow[];
  currencyCode: string;
  overdueAfterDays: number;
}) {
  const [bucket, setBucket] = useState<BucketFilter>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const money = (value: number) => formatMoney(value, currencyCode);
  const totals = bucketTotals(rows);
  const visible = rows
    .filter((row) => (bucket === "all" ? true : row.bucket === bucket))
    .filter((row) => (overdueOnly ? row.overdue : true));
  const overdueCount = rows.filter((row) => row.overdue).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            label="Invoice age"
            value={bucket}
            onChange={setBucket}
            options={bucketOptions()}
          />
          <button
            type="button"
            aria-pressed={overdueOnly}
            onClick={() => setOverdueOnly((on) => !on)}
            className={`ob-touch-target rounded-full border px-3 text-sm ${
              overdueOnly
                ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-white"
                : "border-[var(--ob-border)] text-[var(--ob-text-secondary)]"
            }`}
          >
            Overdue only ({overdueCount})
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {totals.map((total) => (
            <div key={total.id}>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                {total.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold">{money(total.due)}</dd>
              <dd className="text-xs text-[var(--ob-text-muted)]">
                {total.count} invoice{total.count === 1 ? "" : "s"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-[var(--ob-text-muted)]">
          Total exposure {money(totalExposure(rows))} across {rows.length} open
          invoice{rows.length === 1 ? "" : "s"}. Invoices carry no due date in
          the system, so a balance older than {overdueAfterDays} days is
          treated as overdue.
        </p>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length ? "No invoices match this filter" : "Nothing outstanding"}
          description={
            rows.length
              ? "Clear the age filter to see the whole receivables book."
              : "Every posted invoice is settled. Balances appear here as soon as a bill is issued with a payment still open."
          }
        />
      ) : (
        <>
          <div className="ob-scroll-x ob-card hidden md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Collected</th>
                  <th className="px-4 py-3 text-right">Due</th>
                  <th className="px-4 py-3">Age</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.orderId} className="border-b border-[var(--ob-border)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/orders/${row.orderId}`}
                        className="text-[var(--ob-primary)] hover:underline"
                      >
                        {row.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.customerName ?? "Walk-in"}</td>
                    <td className="px-4 py-3 text-[var(--ob-text-muted)]">
                      {formatDate(row.issuedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">{money(row.grandTotal)}</td>
                    <td className="px-4 py-3 text-right">{money(row.collected)}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {money(row.due)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--ob-text-muted)]">
                        {row.ageDays}d
                      </span>
                      {row.overdue ? (
                        <Badge tone="danger" className="ml-2">
                          overdue
                        </Badge>
                      ) : (
                        <Badge tone="neutral" className="ml-2">
                          {row.bucketLabel}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visible.map((row) => (
              <li key={row.orderId} className="ob-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${row.orderId}`}
                      className="font-medium text-[var(--ob-primary)]"
                    >
                      {row.orderNumber}
                    </Link>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {row.customerName ?? "Walk-in"} · {formatDate(row.issuedAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold">{money(row.due)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ob-text-muted)]">
                  <span>Due of {money(row.grandTotal)}</span>
                  <span>· {row.ageDays}d old</span>
                  {row.overdue ? <Badge tone="danger">overdue</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold">Payment history by customer</h2>
        {history.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
            No posted invoices yet, so there is no payment history to summarise.
          </Card>
        ) : (
          <div className="ob-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {history.slice(0, 12).map((row) => (
              <Card key={row.customerId ?? row.customerName} className="p-4">
                <p className="font-medium">
                  {row.customerId ? (
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="text-[var(--ob-primary)] hover:underline"
                    >
                      {row.customerName}
                    </Link>
                  ) : (
                    row.customerName
                  )}
                </p>
                <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                  {row.invoices} invoice{row.invoices === 1 ? "" : "s"} ·{" "}
                  {money(row.billed)} billed
                </p>
                <p className="mt-2 text-sm">
                  {money(row.collected)} collected
                  <span className="text-[var(--ob-text-muted)]">
                    {" · "}
                    {row.collectionRate}%
                  </span>
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{money(row.outstanding)}</span>{" "}
                  outstanding
                  {row.overdueInvoices ? (
                    <Badge tone="danger" className="ml-2">
                      {row.overdueInvoices} overdue
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                  {row.lastPaymentAt
                    ? `Last payment ${formatDate(row.lastPaymentAt)}`
                    : "No payments recorded"}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
