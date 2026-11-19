import type { Order } from "@/types/database";
import { formatMoney } from "@/lib/format";
import type { ObNotification } from "@/components/notifications/reducer";

/**
 * The merchant-side half of the brand websites: every online order in the
 * demo bucket becomes a bell notification ("customer placed an order on the
 * website"), deduplicated by id so re-seeds collapse instead of piling up.
 */
export function webOrderNotifications(
  entries: { order: Order; itemCount: number }[],
  brandName: string,
): ObNotification[] {
  return entries.map(({ order, itemCount }) => ({
    id: `web-order-${order.id}`,
    kind: "order" as const,
    title: `New online order ${order.order_number}`,
    message: [
      order.customer_name_snapshot ?? "A website guest",
      `${itemCount} ${itemCount === 1 ? "item" : "items"}`,
      formatMoney(order.grand_total, "INR"),
      `${brandName} website`,
    ].join(" · "),
    href: `/orders/${order.id}`,
    createdAt: new Date(order.created_at).getTime(),
    read: false,
  }));
}
