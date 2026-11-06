import Link from "next/link";
import type { Order } from "@/types/database";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { viewOrderDetailLabel } from "@/lib/orders/order-list-helpers";

function paymentBadgeTone(status: string) {
  if (status === "paid") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "partial") return "demo" as const;
  return "neutral" as const;
}

export function CustomerOrdersTable({
  orders,
  currencyCode,
  orderNumberColumn,
}: {
  orders: Order[];
  currencyCode: string;
  orderNumberColumn: string;
}) {
  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="Orders linked to this customer will show here, newest first."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {orders.map((o) => (
          <li key={o.id} className="ob-card p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                className="font-semibold text-[var(--ob-primary)]"
                href={`/orders/${o.id}`}
              >
                {o.order_number}
              </Link>
              <span className="font-semibold">
                {formatMoney(o.grand_total, currencyCode)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone={o.status === "draft" ? "warning" : "neutral"}>
                {o.status}
              </Badge>
              <Badge tone={paymentBadgeTone(o.payment_status)}>
                {o.payment_status}
              </Badge>
              <span className="text-xs text-[var(--ob-text-muted)]">
                {formatDate(o.created_at)}
              </span>
            </div>
            <Link
              href={`/orders/${o.id}`}
              className="ob-touch-target mt-3 inline-flex w-full items-center justify-center rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-[var(--ob-surface-muted)] px-3 py-2.5 text-sm font-medium"
            >
              {viewOrderDetailLabel(o)}
            </Link>
          </li>
        ))}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              <th className="px-4 py-3">{orderNumberColumn}</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-[var(--ob-border)]">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-[var(--ob-primary)] hover:underline"
                    href={`/orders/${o.id}`}
                  >
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {formatMoney(o.grand_total, currencyCode)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={o.status === "draft" ? "warning" : "neutral"}>
                    {o.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={paymentBadgeTone(o.payment_status)}>
                    {o.payment_status}
                  </Badge>
                </td>
                <td className="px-4 py-3">{formatDate(o.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/orders/${o.id}`}
                    className="inline-flex items-center justify-center rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text)] transition hover:bg-[var(--ob-surface-muted)]"
                  >
                    {viewOrderDetailLabel(o)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
