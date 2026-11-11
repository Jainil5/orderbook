import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./index";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("CSV demo packs", () => {
  for (const code of ["BR-1", "BR-2"] as const) {
    const pack = getDemoBrandPack(code);
    it(`${code}: referential integrity`, () => {
      const orderIds = new Set(pack.orders.map((o) => o.id));
      const productIds = new Set(pack.products.map((p) => p.id));
      const customerIds = new Set(pack.customers.map((c) => c.id));
      for (const item of pack.orderItems) {
        expect(orderIds.has(item.order_id)).toBe(true);
        if (item.product_id) expect(productIds.has(item.product_id)).toBe(true);
      }
      for (const pay of pack.payments) expect(orderIds.has(pay.order_id)).toBe(true);
      for (const o of pack.orders) {
        if (o.customer_id) expect(customerIds.has(o.customer_id)).toBe(true);
      }
    });
    it(`${code}: unique SKUs and existing image files`, () => {
      const skus = pack.products.map((p) => p.sku).filter(Boolean);
      expect(new Set(skus).size).toBe(skus.length);
      for (const p of pack.products) {
        if (!p.image_url) continue;
        expect(p.image_url.startsWith(`/demo/products/${code}/`)).toBe(true);
        expect(existsSync(resolve(ROOT, "public", p.image_url.slice(1))), p.image_url).toBe(true);
      }
    });
    it(`${code}: history is rebased so the newest order is today`, () => {
      const max = Math.max(...pack.orders.map((o) => new Date(o.created_at).getTime()));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(max).toBeGreaterThanOrEqual(today.getTime());
      expect(max).toBeLessThan(today.getTime() + 86400000);
    });
  }
  it("BR-1 menu realism (ported from brewery-cafe.test.ts)", () => {
    const pack = getDemoBrandPack("BR-1");
    expect(pack.products.some((p) => p.name === "House IPA")).toBe(false);
    expect(pack.orderItems.some((i) => i.product_name_snapshot === "House IPA")).toBe(false);
    const order = pack.orders.find((o) => o.order_number === "BC-1041");
    expect(order).toBeDefined();
    const lines = pack.orderItems.filter((i) => i.order_id === order!.id);
    expect(lines.map((l) => l.product_name_snapshot).sort()).toEqual([
      "Mango Smoothie",
      "Peri Peri Fries",
    ]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(order!.subtotal);
    expect(pack.products.filter((p) => p.category === "Sides & Dips")).toHaveLength(6);
    expect(pack.products.filter((p) => p.category === "Desserts")).toHaveLength(3);
    const pastry = pack.products.find((p) => p.name === "Seasonal Pastry");
    expect(pastry?.default_discount_percent).toBe(50);
  });
});