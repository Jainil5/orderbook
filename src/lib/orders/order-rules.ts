import type { Order, OrderStatus } from "@/types/database";

export function isDraftOrder(order: Pick<Order, "status">): boolean {
  return order.status === "draft";
}

export function isPostedOrder(order: Pick<Order, "status">): boolean {
  return order.status !== "draft";
}

export function canEditOrderLineItems(order: Pick<Order, "status">): boolean {
  return isDraftOrder(order);
}

export function canEditOrderNotes(order: Pick<Order, "status">): boolean {
  void order;
  return true;
}

export function canVoidOrCreditNote(order: Pick<Order, "status">): boolean {
  return (
    order.status === "confirmed" ||
    order.status === "completed" ||
    order.status === "draft"
  );
}

export function isOpenQuote(order: Pick<Order, "status" | "payment_status">): boolean {
  return (
    order.status === "draft" &&
    (order.payment_status === "pending" || order.payment_status === "partial")
  );
}

export function isOpenReceivable(
  order: Pick<Order, "status" | "payment_status" | "grand_total" | "amount_paid">,
): boolean {
  if (order.status === "cancelled" || order.status === "refunded") return false;
  const paid = order.amount_paid ?? 0;
  return paid < order.grand_total;
}

export function allowedStatusTransitions(
  from: OrderStatus,
): OrderStatus[] {
  switch (from) {
    case "draft":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["completed", "cancelled", "refunded"];
    case "completed":
      return ["refunded", "cancelled"];
    case "cancelled":
      return [];
    case "refunded":
      return [];
    default:
      return [];
  }
}
