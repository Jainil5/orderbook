import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory cookie jar, same pattern as the other demo-store tests: values
// over the 4096-byte RFC minimum are dropped, which is what real browsers do.
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

import { placeWebOrder } from "./server";
import { readDemoOrderStore } from "./order-store";
import { readDemoMutableBucket } from "./mutable-store";
import { getDemoBrandPack } from "@/lib/demo/brands";

describe("placeWebOrder", () => {
  beforeEach(() => {
    jar.map.clear();
  });

  it("writes an online ticket into the brand's order store", async () => {
    const result = await placeWebOrder("BR-1", {
      customerName: "Kabir Rao",
      fulfilment: "takeaway",
      notes: "Extra hot, less foam",
      lines: [{ productId: "p1", quantity: 2, modifierIds: ["md", "oat"] }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const pack = getDemoBrandPack("BR-1");
    const stored = await readDemoOrderStore("BR-1");
    const order = stored.orders.find((o) => o.id === result.orderId);
    expect(order).toBeTruthy();
    expect(order!.order_type).toBe("online");
    expect(order!.customer_name_snapshot).toBe("Kabir Rao");
    expect(order!.payment_status).toBe("pending");
    expect(order!.status).toBe("pending");
    expect(order!.notes).toBe("Extra hot, less foam");
    expect(order!.delivery_notes).toBe("Website order — pickup at counter");
    expect(order!.order_number.startsWith("BC-")).toBe(true);
    expect(order!.brand_id).toBe(pack.brand.id);

    // The line keeps the picked modifiers, priced with the Oat milk delta.
    const line = stored.orderItems.find((i) => i.order_id === order!.id)!;
    expect(line.product_name_snapshot).toBe("Flat White (Medium, Oat milk)");
    expect(line.unit_price).toBe(220 + 30);

    // The site order eats stock like a counter bill does (milk + cups).
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.inventoryLedger.some((m) => m.note?.includes(order!.order_number))).toBe(true);

    // The audit trail says who placed it.
    expect(
      bucket.auditLog.some(
        (entry) =>
          entry.entity_id === order!.id &&
          entry.detail?.includes("website order by Kabir Rao"),
      ),
    ).toBe(true);
  });

  it("matches an existing customer's phone instead of creating a new row", async () => {
    const result = await placeWebOrder("BR-1", {
      customerName: "Someone Else",
      phone: "+91 90000 11111",
      fulfilment: "takeaway",
      lines: [{ productId: "p7", quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await readDemoOrderStore("BR-1");
    const order = stored.orders.find((o) => o.id === result.orderId)!;
    expect(order.customer_id).toBe("c2");
    expect(order.customer_name_snapshot).toBe("Ananya Mehta");
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.customers.length).toBe(0);
  });

  it("creates a CRM customer row when the phone is new", async () => {
    const result = await placeWebOrder("BR-1", {
      customerName: "Nikhil Sen",
      phone: "9812345678",
      fulfilment: "takeaway",
      lines: [{ productId: "p7", quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.customers[0].name).toBe("Nikhil Sen");
    expect(bucket.customers[0].notes).toBe("Order placed on the brand website");
  });

  it("demands an address for delivery", async () => {
    const result = await placeWebOrder("BR-1", {
      customerName: "Kabir Rao",
      fulfilment: "delivery",
      lines: [{ productId: "p1", quantity: 1 }],
    });
    expect(result).toMatchObject({ ok: false, message: "Add a delivery address." });
  });

  it("refuses unknown brand codes instead of falling back to the default", async () => {
    const result = await placeWebOrder("BR-99", {
      customerName: "Ghost",
      fulfilment: "takeaway",
      lines: [{ productId: "p1", quantity: 1 }],
    });
    expect(result).toMatchObject({ ok: false, message: "This brand site does not exist." });
  });

  it("applies a pack offer and never sells below it", async () => {
    const result = await placeWebOrder("BR-1", {
      customerName: "Kabir Rao",
      fulfilment: "takeaway",
      offerCode: "food50",
      lines: [{ productId: "p3", quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await readDemoOrderStore("BR-1");
    const order = stored.orders.find((o) => o.id === result.orderId)!;
    expect(order.offer_code_snapshot).toBe("FOOD50");
    // FOOD50 is 50% off Food, capped at ₹150: ₹320 toast → ₹170 taxable.
    expect(order.discount_total).toBeLessThanOrEqual(150);
    expect(order.subtotal).toBe(170);
    expect(order.grand_total).toBeCloseTo(178.5, 6);
  });

  it("places furniture enquiries into the Cubig store", async () => {
    const result = await placeWebOrder("BR-2", {
      customerName: "Meera Patel",
      fulfilment: "delivery",
      address: "Unit 4, Ring Road, Surat",
      notes: "Oak finish, need by month end",
      lines: [{ productId: "fp2", quantity: 4 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = await readDemoOrderStore("BR-2");
    const order = stored.orders.find((o) => o.id === result.orderId)!;
    expect(order.order_type).toBe("online");
    expect(order.delivery_notes).toBe(
      "Website order — deliver to Unit 4, Ring Road, Surat",
    );
    expect(order.order_number.startsWith("CF-")).toBe(true);
    // 18% GST on four ₹12,900 chairs.
    expect(order.subtotal).toBe(51_600);
    expect(order.tax_total).toBeCloseTo(9_288, 6);
  });
});
