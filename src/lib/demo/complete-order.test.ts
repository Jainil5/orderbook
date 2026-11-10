import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderItem } from "@/types/database";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      if (encodeURIComponent(value).length > 4096) return;
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => jar,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { completeDemoOrder } from "./server";
import { getDemoOrder } from "./data";
import { appendDemoOrderRecord } from "./order-store";
import { readDemoMutableBucket, updateDemoMutableBucket } from "./mutable-store";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

function makeStoredOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-complete-1",
    brand_id: "demo-brewery-cafe",
    order_number: "BC-7001",
    status: "pending",
    payment_status: "pending",
    customer_id: null,
    customer_name_snapshot: "User",
    subtotal: 710,
    discount_total: 0,
    tax_total: 35.5,
    fees_total: 0,
    grand_total: 745.5,
    notes: null,
    created_at: new Date(2026, 10, 9, 12, 0).toISOString(),
    amount_paid: 0,
    payment_method: "UPI",
    ...overrides,
  };
}

const emptyItems: OrderItem[] = [];

describe("completeDemoOrder", () => {
  beforeEach(() => {
    jar.map.clear();
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
  });

  it("completes a pending order and auto-records the chosen method", async () => {
    const order = makeStoredOrder();
    await appendDemoOrderRecord("BR-1", order, emptyItems);

    const res = await completeDemoOrder(order.id);
    expect(res).toEqual({ ok: true, orderNumber: "BC-7001" });

    const after = await getDemoOrder(order.id, "BR-1");
    expect(after?.status).toBe("completed");
    expect(after?.payment_status).toBe("paid");
    expect(after?.amount_paid).toBe(745.5);

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.payments[0]).toMatchObject({
      order_id: order.id,
      amount: 745.5,
      method: "UPI",
      status: "paid",
    });
  });

  it("completes without payment when method is null (payment pending)", async () => {
    const order = makeStoredOrder({ payment_method: null });
    await appendDemoOrderRecord("BR-1", order, emptyItems);

    const res = await completeDemoOrder(order.id);
    expect(res.ok).toBe(true);

    const after = await getDemoOrder(order.id, "BR-1");
    expect(after?.status).toBe("completed");
    expect(after?.payment_status).toBe("pending");
    expect(after?.amount_paid).toBe(0);

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.payments).toHaveLength(0);
  });

  it("rejects unknown orders and double-complete", async () => {
    expect(await completeDemoOrder("ghost")).toEqual({
      ok: false,
      message: "Order not found.",
    });

    const order = makeStoredOrder();
    await appendDemoOrderRecord("BR-1", order, emptyItems);
    expect((await completeDemoOrder(order.id)).ok).toBe(true);
    expect(await completeDemoOrder(order.id)).toEqual({
      ok: false,
      message: "Order is already completed.",
    });
  });

  it("rejects cancelled orders", async () => {
    const order = makeStoredOrder({ status: "cancelled" });
    await appendDemoOrderRecord("BR-1", order, emptyItems);
    expect(await completeDemoOrder(order.id)).toEqual({
      ok: false,
      message: "Order is already cancelled.",
    });
  });

  it("completes a fixture order via orderPatches fallback", async () => {
    // Pack order o1 is a fixture (not in the cookie order store); a prior
    // patch made it pending with a payment intent.
    await updateDemoMutableBucket("BR-1", (b) => ({
      ...b,
      orderPatches: {
        ...b.orderPatches,
        o1: { status: "pending", payment_status: "pending", payment_method: "Cash" },
      },
    }));

    const res = await completeDemoOrder("o1");
    expect(res.ok).toBe(true);

    const after = await getDemoOrder("o1", "BR-1");
    expect(after?.status).toBe("completed");
    expect(after?.payment_status).toBe("paid");

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.orderPatches.o1).toMatchObject({
      status: "completed",
      payment_status: "paid",
      amount_paid: after?.grand_total,
    });
    expect(bucket.payments[0]).toMatchObject({
      order_id: "o1",
      method: "Cash",
      amount: after?.grand_total,
    });
  });
});