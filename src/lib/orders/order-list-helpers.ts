import type { Order, OrderItem } from "@/types/database";

export function formatOrderLinePreview(
  items: OrderItem[],
  maxLines = 3,
): string {
  if (!items.length) return "—";
  const parts = items
    .slice(0, maxLines)
    .map((item) => `${item.quantity}× ${item.product_name_snapshot}`);
  const remaining = items.length - maxLines;
  if (remaining > 0) {
    parts.push(`+${remaining} more`);
  }
  return parts.join(", ");
}

export function viewOrderDetailLabel(order: Order): string {
  if (order.status === "draft" || order.payment_status === "pending") {
    return "View quotation";
  }
  return "View bill";
}

export function groupOrderItemsByOrderId(
  items: OrderItem[],
): Map<string, OrderItem[]> {
  const map = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = map.get(item.order_id) ?? [];
    list.push(item);
    map.set(item.order_id, list);
  }
  return map;
}
