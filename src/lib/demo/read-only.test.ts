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
import {
  listDemoCustomers,
  listDemoOrders,
  listDemoPayments,
  listDemoProductsMerged,
} from "./data";
import { DEMO_LIMITS } from "./read-only";
import { modifierPriceDelta, parseProductModifiers } from "@/lib/products/modifiers";
import {
  readDemoMutableBucket,
  updateDemoMutableBucket,
} from "./mutable-store";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";

const pack = getDemoBrandPack("BR-1");

describe("demo record creation", () => {
  beforeEach(() => {
    jar.map.clear();
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
  });

  it("saves a counter bill with its payment and auto-created customer", async () => {
    const res = await submitDemoOrder({
      customerId: null,
      customerPhone: "9000000001",
      walkInName: "Counter Guest",
      lines: [{ productId: pack.products[0].id, quantity: 1 }],
      paymentMethod: "UPI",
      paymentStatus: "pending",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const orders = await listDemoOrders(undefined, "BR-1");
    expect(orders).toHaveLength(pack.orders.length + 1);
    // Found by id, not by position: rebased seeded orders can be dated later
    // in the day than the one just created, so the list head is not the new bill.
    const created = orders.find((o) => o.id === res.orderId)!;
    expect(created.order_number).toMatch(/^BC-\d+$/);
    expect(created.payment_status).toBe("paid");
    expect(await listDemoPayments("BR-1")).toHaveLength(pack.payments.length + 1);
    // The new mobile matched no seeded customer, so one was created.
    expect(
      (await listDemoCustomers(undefined, "BR-1")).some(
        (c) => c.phone === "9000000001",
      ),
    ).toBe(true);
    // Seeded orders are untouched.
    for (const order of pack.orders) {
      expect(orders.some((o) => o.id === order.id)).toBe(true);
    }
  });

  it("saves a quotation as a draft with a share token and no payment", async () => {
    const res = await submitDemoOrder({
      customerId: pack.customers[0].id,
      lines: [{ productId: pack.products[1].id, quantity: 2 }],
      paymentMethod: "",
      paymentStatus: "pending",
      saveAsQuote: true,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const created = (await listDemoOrders(undefined, "BR-1")).find(
      (o) => o.id === res.orderId,
    )!;
    expect(created.status).toBe("draft");
    expect(created.public_token).toBeTruthy();
    expect(created.amount_paid).toBe(0);
    expect(await listDemoPayments("BR-1")).toHaveLength(pack.payments.length);
  });

  it("creates customers, offers, products, payments, refunds, credit notes and stock adjustments", async () => {
    const payable = pack.orders.find((o) => o.status === "pending")!;
    const creditable = pack.orders.find((o) => o.status === "completed")!;
    const orderId = payable.id;

    const customer = await saveDemoCustomer({
      name: "New Guest",
      phone: "9876543210",
    });
    expect(customer.ok).toBe(true);
    const offer = await saveDemoOffer({
      name: "Demo offer",
      code: "DEMO10",
      discount_type: "percent",
      discount_value: 10,
      scope: "order",
    });
    expect(offer.ok).toBe(true);
    const product = await saveDemoProduct(null, {
      name: "New product",
      price: 100,
      stock_qty: 5,
    });
    expect(product.ok).toBe(true);
    expect(
      (await listDemoProductsMerged(undefined, "BR-1")).some(
        (p) => p.name === "New product",
      ),
    ).toBe(true);

    const payment = await recordDemoPayment({
      orderId,
      amount: 100,
      method: "Cash",
    });
    expect(payment.ok).toBe(true);
    const refund = await recordDemoRefund({
      orderId,
      amount: 50,
      reason: "test",
    });
    expect(refund.ok).toBe(true);
    const credit = await createDemoCreditNote(creditable.id);
    expect(credit.ok).toBe(true);
    const adjustment = await recordDemoStockAdjustment({
      productId: pack.products[0].id,
      deltaQty: 5,
      reason: "test",
    });
    expect(adjustment.ok).toBe(true);

    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.customers).toHaveLength(1);
    expect(bucket.offers).toHaveLength(1);
    expect(bucket.products).toHaveLength(1);
    expect(bucket.payments).toHaveLength(1);
    expect(bucket.refunds).toHaveLength(1);
    expect(bucket.stockAdjustments).toHaveLength(1);

    const creditOrder = (await listDemoOrders(undefined, "BR-1")).find(
      (o) => o.parent_order_id === creditable.id,
    );
    expect(creditOrder?.order_kind).toBe("credit_note");
    expect(creditOrder?.grand_total).toBeLessThan(0);
    expect((await listDemoOrders(undefined, "BR-1")).length).toBe(
      pack.orders.length + 1,
    );
  });

  it("recycles the oldest browser-created document at the cap, never a seeded one", async () => {
    for (let i = 0; i < DEMO_LIMITS.orders + 1; i += 1) {
      const res = await submitDemoOrder({
        customerId: pack.customers[0].id,
        lines: [{ productId: pack.products[0].id, quantity: 1 }],
        paymentMethod: "",
        paymentStatus: "pending",
        saveAsQuote: true,
      });
      expect(res.ok).toBe(true);
    }
    const orders = await listDemoOrders(undefined, "BR-1");
    // The combined view holds the seeds plus a full cookie store.
    expect(orders).toHaveLength(pack.orders.length + DEMO_LIMITS.orders);
    for (const order of pack.orders) {
      expect(orders.some((o) => o.id === order.id)).toBe(true);
    }
    expect(
      orders.filter((o) => o.id.startsWith("demo-order-")),
    ).toHaveLength(DEMO_LIMITS.orders);
  });

  it("keeps the walk-in name on the bill when the customer cap is hit", async () => {
    const filler = Array.from({ length: DEMO_LIMITS.customers }, (_, i) => ({
      id: `demo-customer-fill-${i}`,
      brand_id: pack.brand.id,
      name: `Filler ${i}`,
      email: null,
      phone: `9000001${String(i).padStart(2, "0")}`,
      notes: null,
      price_tier: null,
      created_at: new Date().toISOString(),
    }));
    await updateDemoMutableBucket("BR-1", (b) => ({ ...b, customers: filler }));

    const res = await submitDemoOrder({
      customerId: null,
      customerPhone: "9111100000",
      walkInName: "Overflow Guest",
      lines: [{ productId: pack.products[0].id, quantity: 1 }],
      paymentMethod: "",
      paymentStatus: "pending",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const created = (await listDemoOrders(undefined, "BR-1")).find(
      (o) => o.id === res.orderId,
    )!;
    expect(created.customer_id).toBeNull();
    expect(created.customer_name_snapshot).toBe("Overflow Guest");
  });

  it("persists modifier groups when a demo product is edited", async () => {
    const base = pack.products.find((p) => p.id === "p1")!;
    const saved = await saveDemoProduct("p1", {
      ...base,
      modifiers_json: [
        {
          id: "size",
          name: "Size",
          type: "single",
          required: true,
          options: [
            { id: "sm", name: "Small", price: -30 },
            { id: "md", name: "Medium", price: 0, default: true },
          ],
        },
      ],
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const merged = (
      await listDemoProductsMerged(undefined, "BR-1")
    ).find((p) => p.id === "p1")!;
    expect(
      parseProductModifiers(merged).map((g) => [g.id, g.type, g.required]),
    ).toEqual([["size", "single", true]]);
    expect(modifierPriceDelta(merged, ["sm"])).toBe(-30);
    // The shipped pack stays untouched — overrides live in the cookie bucket.
    expect(parseProductModifiers(base)[0].id).toBe("size");
    expect(parseProductModifiers(base)[0].options).toHaveLength(3);
  });
});
