import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "@/types/database";
import { groupBoardOrders } from "@/lib/orders/board-grouping";

function order(id: string, status: OrderStatus, when: Date): Order {
  return {
    id,
    brand_id: "b1",
    order_number: id.toUpperCase(),
    status,
    payment_status: "pending",
    customer_id: null,
    customer_name_snapshot: "Guest",
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 100,
    notes: null,
    created_at: when.toISOString(),
  };
}

describe("groupBoardOrders", () => {
  const now = new Date(2026, 10, 10, 14, 0, 0); // 10 Nov 2026 14:00 local

  it("buckets pending and confirmed as ongoing, oldest first", () => {
    const early = order("a", "pending", new Date(2026, 10, 10, 8, 0, 0));
    const late = order("b", "confirmed", new Date(2026, 10, 10, 9, 0, 0));
    const newest = order("c", "pending", new Date(2026, 10, 10, 10, 0, 0));
    const { ongoing } = groupBoardOrders([newest, early, late], now);
    expect(ongoing.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("completed today only includes same local day, newest first", () => {
    const morning = order("m", "completed", new Date(2026, 10, 10, 7, 30, 0));
    const afternoon = order("p", "completed", new Date(2026, 10, 10, 13, 15, 0));
    const { completedToday } = groupBoardOrders([morning, afternoon], now);
    expect(completedToday.map((o) => o.id)).toEqual(["p", "m"]);
  });

  it("excludes a completed order created 23:59 the previous day", () => {
    const midnight = order("z", "completed", new Date(2026, 10, 9, 23, 59, 0));
    const { completedToday } = groupBoardOrders([midnight], now);
    expect(completedToday).toEqual([]);
  });

  it("excludes drafts, cancelled and refunded from both buckets", () => {
    const today = new Date(2026, 10, 10, 11, 0, 0);
    const { ongoing, completedToday } = groupBoardOrders(
      [
        order("d", "draft", today),
        order("x", "cancelled", today),
        order("r", "refunded", today),
      ],
      now,
    );
    expect(ongoing).toEqual([]);
    expect(completedToday).toEqual([]);
  });
});
