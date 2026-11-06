"use client";

import Link from "next/link";
import type { Payment } from "@/types/database";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export function PaymentsTable({
  payments,
  currencyCode,
  showOrderLink = false,
}: {
  payments: Payment[];
  currencyCode: string;
  showOrderLink?: boolean;
}) {
  return (
    <>
      <ul className="space-y-3 md:hidden">
        {payments.map((p) => (
          <li key={p.id} className="ob-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.method}</p>
                {showOrderLink ? (
                  <Link
                    href={`/orders/${p.order_id}`}
                    className="text-xs text-[var(--ob-primary)]"
                  >
                    View order
                  </Link>
                ) : null}
              </div>
              <p className="font-semibold">
                {formatMoney(p.amount, currencyCode)}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <Badge tone="success">{p.status}</Badge>
              <span className="text-[var(--ob-text-muted)]">
                {formatDate(p.created_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              {showOrderLink ? <th className="px-4 py-3">Order</th> : null}
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-[var(--ob-border)]">
                {showOrderLink ? (
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${p.order_id}`}
                      className="text-[var(--ob-primary)] hover:underline"
                    >
                      View order
                    </Link>
                  </td>
                ) : null}
                <td className="px-4 py-3">{p.method}</td>
                <td className="px-4 py-3">
                  {formatMoney(p.amount, currencyCode)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="success">{p.status}</Badge>
                </td>
                <td className="px-4 py-3">{formatDate(p.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
