import type { OrderType } from "@/types/database";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine-in",
  takeaway: "Take-away",
  delivery: "Delivery",
  online: "Online order",
};
