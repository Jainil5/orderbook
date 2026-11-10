"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Order, OrderItem } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { OrdersTable } from "@/components/orders/orders-table";
import { formatMoney } from "@/lib/format";
import {
  formatOrderLinePreview,
  groupOrderItemsByOrderId,
} from "@/lib/orders/order-list-helpers";
import { groupBoardOrders } from "@/lib/orders/board-grouping";
import { paymentBadgeTone } from "@/lib/orders/payment-badge";
import { isPendingOrder } from "@/lib/orders/order-rules";
import { ORDER_TYPE_LABELS } from "@/lib/orders/order-labels";
import { minutesSince } from "@/lib/manager/time";
import { completeOrderAction } from "@/services/operations-actions";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/cn";

type Tab = "ongoing" | "all";

export function OrdersBoard({
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
  const [tab, setTab] = useState<Tab>("ongoing");
  const mounted = useMounted();

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Order views" className="flex flex-wrap gap-2">
        {(
          [
            ["ongoing", "Ongoing"],
            ["all", "All orders"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "ob-touch-target rounded-full border px-4 py-1.5 text-sm font-medium transition",
              tab === value
                ? "border-[var(--ob-primary)] bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)]"
                : "border-[var(--ob-border)] bg-[var(--ob-surface)] hover:bg-[var(--ob-surface-muted)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "all" ? (
        <OrdersTable
          orders={orders}
          orderItems={orderItems}
          currencyCode={currencyCode}
          orderNumberColumn={orderNumberColumn}
        />
      ) : mounted ? (
        <OngoingSections
          orders={orders}
          orderItems={orderItems}
          currencyCode={currencyCode}
        />
      ) : (
        <p className="text-sm text-[var(--ob-text-muted)]">Loading orders…</p>
      )}
    </div>
  );
}

function OngoingSections({
  orders,
  orderItems,
  currencyCode,
}: {
  orders: Order[];
  orderItems: OrderItem[];
  currencyCode: string;
}) {
  const { ongoing, completedToday } = groupBoardOrders(orders, new Date());
  const itemsByOrder = groupOrderItemsByOrderId(orderItems);

  return (
    <div className="space-y-6">
      <section aria-labelledby="ongoing-heading">
        <h2 id="ongoing-heading" className="mb-3 font-semibold">
          Ongoing ({ongoing.length})
        </h2>
        {ongoing.length === 0 ? (
          <EmptyState title="No ongoing orders" />
        ) : (
          <ul className="space-y-3">
            {ongoing.map((o) => (
              <OngoingRow
                key={o.id}
                order={o}
                preview={formatOrderLinePreview(itemsByOrder.get(o.id) ?? [])}
                currencyCode={currencyCode}
              />
            ))}
          </ul>
        )}
      </section>

      {completedToday.length > 0 ? (
        <section aria-labelledby="completed-heading">
          <h2 id="completed-heading" className="mb-3 font-semibold">
            Completed today ({completedToday.length})
          </h2>
          <ul className="space-y-3">
            {completedToday.map((o) => (
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {o.order_type ? (
                    <Badge tone="neutral">{ORDER_TYPE_LABELS[o.order_type]}</Badge>
                  ) : null}
                  <Badge tone={paymentBadgeTone(o.payment_status)}>
                    {o.payment_status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function OngoingRow({
  order: o,
  preview,
  currencyCode,
}: {
  order: Order;
  preview: string;
  currencyCode: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const waitMin = isPendingOrder(o) ? minutesSince(o.created_at, new Date()) : null;

  async function onComplete() {
    setBusy(true);
    setError(null);
    try {
      const result = await completeOrderAction(o.id);
      if (result.ok) router.refresh();
      else setError("message" in result ? result.message : "Could not update.");
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ob-card p-4">
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
        {o.order_type ? (
          <Badge tone="neutral">{ORDER_TYPE_LABELS[o.order_type]}</Badge>
        ) : null}
        <Badge tone={o.status === "pending" ? "warning" : "demo"}>{o.status}</Badge>
        <Badge tone={paymentBadgeTone(o.payment_status)}>{o.payment_status}</Badge>
        {o.table_tag ? (
          <span className="text-xs text-[var(--ob-text-muted)]">
            Tag {o.table_tag}
          </span>
        ) : o.delivery_address ? (
          <span className="line-clamp-1 max-w-[12rem] text-xs text-[var(--ob-text-muted)]">
            {o.delivery_address}
          </span>
        ) : null}
        {waitMin != null ? (
          <Badge tone={waitMin < 45 ? "neutral" : "warning"}>{waitMin} min</Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          loading={busy}
          onClick={onComplete}
          className="ob-touch-target"
        >
          Order Completed
        </Button>
        <Link
          href={`/orders/${o.id}`}
          className="ob-touch-target inline-flex items-center rounded-[var(--ob-radius-md)] px-3 text-sm font-medium text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]"
        >
          Cancel / detail
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}
    </li>
  );
}
