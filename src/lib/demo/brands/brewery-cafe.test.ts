import { describe, expect, it } from "vitest";
import { BREWERY_CAFE_DEMO } from "./brewery-cafe";

describe("Brewery Cafe menu realism", () => {
  it("has no House IPA in products or order snapshots", () => {
    expect(BREWERY_CAFE_DEMO.products.some((p) => p.name === "House IPA")).toBe(false);
    expect(
      BREWERY_CAFE_DEMO.orderItems.some((i) => i.product_name_snapshot === "House IPA"),
    ).toBe(false);
    expect(
      BREWERY_CAFE_DEMO.analytics.topProducts.some((p) => p.name === "House IPA"),
    ).toBe(false);
  });

  it("rewrites BC-1041 to Mango Smoothie + Peri Peri Fries summing to the subtotal", () => {
    const order = BREWERY_CAFE_DEMO.orders.find((o) => o.order_number === "BC-1041");
    expect(order).toBeDefined();
    const lines = BREWERY_CAFE_DEMO.orderItems.filter((i) => i.order_id === order!.id);
    expect(lines.map((l) => l.product_name_snapshot).sort()).toEqual([
      "Mango Smoothie",
      "Peri Peri Fries",
    ]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(order!.subtotal);
  });

  it("has six Sides & Dips and three Desserts, all with self-hosted photos", () => {
    const sides = BREWERY_CAFE_DEMO.products.filter((p) => p.category === "Sides & Dips");
    const desserts = BREWERY_CAFE_DEMO.products.filter((p) => p.category === "Desserts");
    expect(sides).toHaveLength(6);
    expect(desserts).toHaveLength(3);
    for (const p of [...sides, ...desserts]) {
      expect(p.image_url?.startsWith("/demo/products/")).toBe(true);
    }
  });

  it("keeps Seasonal Pastry's 50% discount after moving it to Desserts", () => {
    const pastry = BREWERY_CAFE_DEMO.products.find((p) => p.name === "Seasonal Pastry");
    expect(pastry?.category).toBe("Desserts");
    expect(pastry?.default_discount_percent).toBe(50);
  });
});