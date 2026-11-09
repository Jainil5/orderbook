import { describe, expect, it } from "vitest";
import { mergeDemoProducts } from "./merge-entities";
import type { DemoMutableBucket } from "./mutable-store";
import type { Product } from "@/types/database";

function baseProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    brand_id: "demo-brewery-cafe",
    name: `Base ${id}`,
    description: null,
    sku: null,
    category: "Food",
    price: 100,
    unit: "plate",
    is_active: true,
    ...overrides,
  };
}

function bucketWith(partial: Partial<DemoMutableBucket>): DemoMutableBucket {
  return {
    customers: [],
    offers: [],
    payments: [],
    orderPatches: {},
    productOverrides: {},
    auditLog: [],
    stockAdjustments: [],
    refunds: [],
    staff: [],
    staffOverrides: {},
    services: [],
    serviceOverrides: {},
    serviceJobs: [],
    serviceJobOverrides: {},
    appointments: [],
    appointmentOverrides: {},
    tasks: [],
    taskOverrides: {},
    shifts: [],
    shiftOverrides: {},
    visits: [],
    visitOverrides: {},
    products: [],
    ...partial,
  };
}

describe("mergeDemoProducts", () => {
  it("applies per-product overrides from the mutable bucket", () => {
    const base = [baseProduct("p1")];
    const merged = mergeDemoProducts(
      base,
      bucketWith({ productOverrides: { p1: { price: 250 } } }),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].price).toBe(250);
  });

  it("appends products created in the demo bucket after the pack products", () => {
    const base = [baseProduct("p1"), baseProduct("p2")];
    const created = baseProduct("demo-prod-1", {
      name: "QTest Tonic",
      price: 199,
    });
    const merged = mergeDemoProducts(base, bucketWith({ products: [created] }));
    expect(merged.map((p) => p.id)).toEqual(["p1", "p2", "demo-prod-1"]);
    expect(merged[2].name).toBe("QTest Tonic");
  });

  it("applies overrides to created products too", () => {
    const created = baseProduct("demo-prod-1", { price: 199 });
    const merged = mergeDemoProducts(
      [baseProduct("p1")],
      bucketWith({
        products: [created],
        productOverrides: { "demo-prod-1": { price: 249 } },
      }),
    );
    expect(merged).toHaveLength(2);
    expect(merged[1].price).toBe(249);
  });

  it("tolerates legacy buckets without a products field", () => {
    const legacy = { ...bucketWith({}), products: undefined } as unknown as
      DemoMutableBucket;
    const merged = mergeDemoProducts([baseProduct("p1")], legacy);
    expect(merged).toHaveLength(1);
  });
});
