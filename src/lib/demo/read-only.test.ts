import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { getDemoBrandPack } from "./brands/index";
import {
  createDemoCreditNote,
  recordDemoPayment,
  recordDemoRefund,
  recordDemoStockAdjustment,
  saveDemoCustomer,
  saveDemoOffer,
  saveDemoProduct,
  submitDemoOrder,
} from "./server";
import { listDemoCustomers, listDemoOrders, listDemoPayments } from "./data";
import { DEMO_LIMITS, DEMO_READ_ONLY_MESSAGE } from "./read-only";
import { readDemoMutableBucket } from "./mutable-store";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

const pack = getDemoBrandPack("BR-1");
const readOnly = { ok: false, message: DEMO_READ_ONLY_MESSAGE };

describe("demo write lock-down", () => {
  beforeEach(() => {
    jar.map.clear();
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
  });

  it("refuses a counter bill and leaves orders and payments as shipped", async () => {
    const res = await submitDemoOrder({
      customerId: pack.customers[0].id,
      lines: [{ productId: pack.products[0].id, quantity: 1 }],
      paymentMethod: "UPI",
      paymentStatus: "pending",
    });

    expect(res).toEqual({ ok: false, code: "VALIDATION", message: DEMO_READ_ONLY_MESSAGE });
    expect(await listDemoOrders(undefined, "BR-1")).toHaveLength(pack.orders.length);
    expect(await listDemoPayments("BR-1")).toHaveLength(pack.payments.length);
  });

  it("refuses every other record-creating action", async () => {
    const orderId = pack.orders[0].id;
    expect(await saveDemoCustomer({ name: "New Guest", phone: "9876543210" })).toEqual(readOnly);
    expect(
      await saveDemoOffer({
        name: "Demo offer",
        code: "DEMO10",
        discount_type: "percent",
        discount_value: 10,
        scope: "order",
      }),
    ).toEqual(readOnly);
    expect(await recordDemoPayment({ orderId, amount: 100, method: "Cash" })).toEqual(readOnly);
    expect(await recordDemoRefund({ orderId, amount: 100, reason: "test" })).toEqual(readOnly);
    expect(await createDemoCreditNote(orderId)).toEqual(readOnly);
    expect(
      await recordDemoStockAdjustment({
        productId: pack.products[0].id,
        deltaQty: 5,
        reason: "test",
      }),
    ).toEqual(readOnly);
    expect(await saveDemoProduct(null, { name: "New product", price: 100 })).toEqual({
      ok: false,
      error: DEMO_READ_ONLY_MESSAGE,
    });

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.customers).toHaveLength(0);
    expect(bucket.payments).toHaveLength(0);
    expect((await listDemoCustomers(undefined, "BR-1")).length).toBeLessThanOrEqual(
      DEMO_LIMITS.customers,
    );
  });
});
