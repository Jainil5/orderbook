import Link from "next/link";
import type { Order, OrderItem } from "@/types/database";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  formatOrderLinePreview,
  groupOrderItemsByOrderId,
  viewOrderDetailLabel,
} from "@/lib/orders/order-list-helpers";
import { paymentBadgeTone } from "@/lib/orders/payment-badge";

export function OrdersTable({
  orders,
  orderItems,
  currencyCode,
  orderNumberColumn,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  currencyCode: string;
  orderNumberColumn: string;
}) {
  const itemsByOrder = groupOrderItemsByOrderId(orderItems);

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {orders.map((o) => {
          const lines = itemsByOrder.get(o.id) ?? [];
          const preview = formatOrderLinePreview(lines);
          return (
            <li key={o.id} className="ob-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    className="font-semibold text-[var(--ob-primary)]"
                    href={`/orders/${o.id}`}
                  >
                    {o.order_number}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-[var(--ob-text-secondary)]">
                    {o.customer_name_snapshot ?? "Walk-in"}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold">
                  {formatMoney(o.grand_total, currencyCode)}
                </p>
              </div>
              {preview !== "—" ? (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--ob-text-muted)]">
                  {preview}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
          );
        })}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              <th className="px-4 py-3">{orderNumberColumn}</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const lines = itemsByOrder.get(o.id) ?? [];
              const preview = formatOrderLinePreview(lines);
              return (
                <tr key={o.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3 align-top">
                    <Link
                      className="font-medium text-[var(--ob-primary)] hover:underline"
                      href={`/orders/${o.id}`}
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {o.customer_name_snapshot ?? "—"}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 align-top text-[var(--ob-text-secondary)]">
                    <span
                      className="line-clamp-2"
                      title={preview === "—" ? undefined : preview}
                    >
                      {preview}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {formatMoney(o.grand_total, currencyCode)}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={o.status === "draft" ? "warning" : "neutral"}>
                      {o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={paymentBadgeTone(o.payment_status)}>
                      {o.payment_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap">
                    {formatDate(o.created_at)}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <Link
                      href={`/orders/${o.id}`}
                      className="inline-flex items-center justify-center rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text)] transition hover:bg-[var(--ob-surface-muted)]"
                    >
                      {viewOrderDetailLabel(o)}
                    </Link>
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
