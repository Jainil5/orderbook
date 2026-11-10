import Link from "next/link";
import type { Customer, Order } from "@/types/database";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { ORDER_TYPE_LABELS } from "@/lib/orders/order-labels";

export function OrderCustomerDetails({
  order,
  customer,
  customerPhone,
}: {
  order: Order;
  customer: Customer | null;
  customerPhone?: string | null;
}) {
  const displayName =
    customer?.name ??
    (order.customer_name_snapshot?.trim() || "Walk-in customer");
  const phone = customer?.phone?.trim() || customerPhone?.trim() || null;
  const email = customer?.email?.trim() || null;
  const notes = customer?.notes?.trim() || null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold">Customer</h2>
        {customer ? (
          <Link
            href={`/customers/${customer.id}`}
            className="text-sm font-medium text-[var(--ob-primary)]"
          >
            View profile
          </Link>
        ) : null}
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--ob-text-muted)]">Name</dt>
          <dd className="mt-0.5 font-medium">{displayName}</dd>
        </div>
        <div>
          <dt className="text-[var(--ob-text-muted)]">Mobile</dt>
          <dd className="mt-0.5 font-medium">{phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ob-text-muted)]">Email</dt>
          <dd className="mt-0.5 font-medium break-all">{email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--ob-text-muted)]">Customer type</dt>
          <dd className="mt-0.5 font-medium">
            {customer ? "Saved customer" : "Walk-in / guest"}
          </dd>
        </div>
        {customer?.notes || notes ? (
          <div className="sm:col-span-2">
            <dt className="text-[var(--ob-text-muted)]">Customer notes</dt>
            <dd className="mt-0.5">{notes}</dd>
          </div>
        ) : null}
        {order.order_type ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Order type</dt>
            <dd className="mt-0.5 font-medium">
              {ORDER_TYPE_LABELS[order.order_type]}
            </dd>
          </div>
        ) : null}
        {order.service_date ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Service date</dt>
            <dd className="mt-0.5 font-medium">{order.service_date}</dd>
          </div>
        ) : null}
        {order.guests != null ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Guests</dt>
            <dd className="mt-0.5 font-medium">{order.guests}</dd>
          </div>
        ) : null}
        {order.payment_method ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Payment method</dt>
            <dd className="mt-0.5 font-medium">{order.payment_method}</dd>
          </div>
        ) : null}
        {order.payment_reference ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Payment reference</dt>
            <dd className="mt-0.5 font-medium">{order.payment_reference}</dd>
          </div>
        ) : null}
        {order.table_tag?.trim() ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Table / tag</dt>
            <dd className="mt-0.5 font-medium">{order.table_tag}</dd>
          </div>
        ) : null}
        {order.delivery_address?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="text-[var(--ob-text-muted)]">Delivery address</dt>
            <dd className="mt-0.5">{order.delivery_address}</dd>
          </div>
        ) : null}
        {order.delivery_notes?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="text-[var(--ob-text-muted)]">Delivery / site</dt>
            <dd className="mt-0.5">{order.delivery_notes}</dd>
          </div>
        ) : null}
        {order.deposit_percent != null ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Deposit</dt>
            <dd className="mt-0.5 font-medium">{order.deposit_percent}%</dd>
          </div>
        ) : null}
        {order.offer_code_snapshot?.trim() ? (
          <div>
            <dt className="text-[var(--ob-text-muted)]">Offer code</dt>
            <dd className="mt-0.5 font-medium">{order.offer_code_snapshot}</dd>
          </div>
        ) : null}
        {order.notes?.trim() ? (
          <div className="sm:col-span-2">
            <dt className="text-[var(--ob-text-muted)]">Order notes</dt>
            <dd className="mt-0.5">{order.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[var(--ob-text-muted)]">Order placed</dt>
          <dd className="mt-0.5">{formatDate(order.created_at)}</dd>
        </div>
        <div>
          <dt className="text-[var(--ob-text-muted)]">Payment status</dt>
          <dd className="mt-0.5 font-medium capitalize">{order.payment_status}</dd>
        </div>
      </dl>
    </Card>
  );
}
