import { describe, expect, it } from "vitest";
import type { Order } from "@/types/database";
import { webOrderNotifications } from "./web-orders";

function webOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o-web-1",
    brand_id: "demo-brewery-cafe",
    order_number: "BC-1100",
    status: "pending",
    payment_status: "pending",
    customer_id: null,
    customer_name_snapshot: "Kabir Rao",
    subtotal: 500,
    discount_total: 0,
    tax_total: 25,
    fees_total: 0,
    grand_total: 525,
    notes: null,
    created_at: "2026-11-19T09:30:00.000Z",
    order_type: "online",
    ...overrides,
  };
}

describe("webOrderNotifications", () => {
  it("announces the site order with the customer's name, items and total", () => {
    const notifications = webOrderNotifications(
      [{ order: webOrder(), itemCount: 3 }],
      "Brewery Cafe",
    );
    expect(notifications).toHaveLength(1);
    const [notification] = notifications;
    expect(notification.id).toBe("web-order-o-web-1");
    expect(notification.kind).toBe("order");
    expect(notification.title).toBe("New online order BC-1100");
    expect(notification.message).toBe(
      "Kabir Rao · 3 items · ₹525.00 · Brewery Cafe website",
    );
    expect(notification.href).toBe("/orders/o-web-1");
    expect(notification.createdAt).toBe(
      new Date("2026-11-19T09:30:00.000Z").getTime(),
    );
  });

  it("falls back to a guest label and handles the singular item", () => {
    const notifications = webOrderNotifications(
      [{ order: webOrder({ customer_name_snapshot: null }), itemCount: 1 }],
      "Cubig Furniture",
    );
    expect(notifications[0].message).toBe(
      "A website guest · 1 item · ₹525.00 · Cubig Furniture website",
    );
  });

  it("keeps newest-first input as-is, so the seed can pass the feed order through", () => {
    const newer = webOrder({ id: "o-new", order_number: "BC-1101", created_at: "2026-11-19T10:00:00.000Z" });
    const older = webOrder({ id: "o-old", order_number: "BC-1100", created_at: "2026-11-18T10:00:00.000Z" });
    const notifications = webOrderNotifications(
      [
        { order: newer, itemCount: 1 },
        { order: older, itemCount: 2 },
      ],
      "Brewery Cafe",
    );
    expect(notifications.map((n) => n.id)).toEqual([
      "web-order-o-new",
      "web-order-o-old",
    ]);
  });
});
