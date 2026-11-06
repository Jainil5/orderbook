"use client";

import Link from "next/link";
import type { Order } from "@/types/database";
import { formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { isOpenQuote } from "@/lib/orders/order-rules";

export function OpenQuotesWidget({
  orders,
  currencyCode,
  orderNumberColumn,
}: {
  orders: Order[];
  currencyCode: string;
  orderNumberColumn: string;
}) {
  const open = orders.filter(
    (o) => isOpenQuote(o) || (o.payment_status !== "paid" && o.status !== "cancelled"),
  );

  if (open.length === 0) {
    return (
      <div className="ob-card p-4">
        <h2 className="text-sm font-semibold">Open quotes & balances</h2>
        <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
          No unpaid quotes or open balances in the latest orders.
        </p>
      </div>
    );
  }

  return (
    <div className="ob-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Open quotes & balances</h2>
        <Link href="/billing" className="text-xs font-medium text-[var(--ob-primary)]">
          Open billing
        </Link>
      </div>
      <ul className="space-y-2">
        {open.slice(0, 8).map((order) => {
          const due = Math.max(0, order.grand_total - (order.amount_paid ?? 0));
          return (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ob-border)] pb-2 text-sm last:border-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/orders/${order.id}`}
                  className="font-medium text-[var(--ob-primary)] hover:underline"
                >
                  {order.order_number}
                </Link>
                <p className="truncate text-xs text-[var(--ob-text-muted)]">
                  {order.customer_name_snapshot ?? "Walk-in"} · {orderNumberColumn.replace("#", "").trim()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={isOpenQuote(order) ? "warning" : "demo"}>
                  {order.payment_status}
                </Badge>
                <span className="font-medium">{formatMoney(due, currencyCode)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
