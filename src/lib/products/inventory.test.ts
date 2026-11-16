import { describe, expect, it } from "vitest";
import type { Order, OrderItem, Product, StockAdjustment } from "@/types/database";
import {
  buildMovementLedger,
  deadStockCandidates,
  filterByStockStatus,
  lowStockAlerts,
  reorderSuggestion,
  skusByStatus,
  soldProductIds,
  stockRows,
  stockStatus,
  summarizeInventory,
} from "@/lib/products/inventory";

function product(
  id: string,
  overrides: Partial<Product> = {},
): Product {
  return {
    id,
    brand_id: "demo-brewery-cafe",
    name: id,
    description: null,
    sku: null,
    category: null,
    price: 100,
    unit: null,
    is_active: true,
    ...overrides,
  };
}

function order(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    brand_id: "demo-brewery-cafe",
    order_number: id.toUpperCase(),
    status: "completed",
    payment_status: "paid",
    customer_id: null,
    customer_name_snapshot: null,
    subtotal: 100,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 100,
    notes: null,
    created_at: "2026-11-10T10:00:00.000Z",
    ...overrides,
  };
}

function item(
  id: string,
  orderId: string,
  productId: string,
  quantity: number,
): OrderItem {
  return {
    id,
    order_id: orderId,
    product_id: productId,
    product_name_snapshot: productId,
    quantity,
    unit_price: 100,
    line_discount: 0,
    line_total: 100 * quantity,
  };
}

function adjustment(
  id: string,
  productId: string,
  deltaQty: number,
  createdAt: string,
): StockAdjustment {
  return {
    id,
    brand_id: "demo-brewery-cafe",
    product_id: productId,
    delta_qty: deltaQty,
    reason: "Counted stock",
    created_at: createdAt,
  };
}

describe("summarizeInventory", () => {
  it("values stock at cost and retail, skipping empty and untracked lines", () => {
    const rows = [
      product("beans", { stock_qty: 10, cost_price: 400, price: 900, low_stock_threshold: 5 }),
      // Zero stock contributes nothing even when a cost is on record.
      product("syrup", { stock_qty: 0, cost_price: 120, price: 300, low_stock_threshold: 5 }),
      // No cost on record: units and retail value still count.
      product("milk", { stock_qty: 4, price: 180 }),
      // Stock not tracked at all.
      product("toast", { price: 320 }),
    ];
    expect(summarizeInventory(rows)).toMatchObject({
      skus: 4,
      tracked: 2,
      untracked: 2,
      units: 14,
      costValue: 4000,
      retailValue: 9720,
    });
  });

  it("counts low and out lines alongside the totals", () => {
    const rows = [
      product("beans", { stock_qty: 2, low_stock_threshold: 5 }),
      product("milk", { stock_qty: 0, low_stock_threshold: 4 }),
      product("cups", { stock_qty: 90, low_stock_threshold: 5 }),
    ];
    expect(summarizeInventory(rows)).toMatchObject({
      lowCount: 2,
      outCount: 1,
    });
  });
});

describe("stockStatus", () => {
  it("calls a line low at or below its reorder level", () => {
    expect(stockStatus(product("beans", { stock_qty: 5, low_stock_threshold: 5 }))).toBe("low");
    expect(stockStatus(product("beans", { stock_qty: 4, low_stock_threshold: 5 }))).toBe("low");
    expect(stockStatus(product("beans", { stock_qty: 6, low_stock_threshold: 5 }))).toBe("ok");
  });

  it("calls an empty tracked line out of stock", () => {
    expect(stockStatus(product("beans", { stock_qty: 0, low_stock_threshold: 5 }))).toBe("out");
    expect(stockStatus(product("beans", { low_stock_threshold: 5 }))).toBe("out");
  });

  it("treats a missing reorder level as untracked whatever the count says", () => {
    expect(stockStatus(product("beans", { stock_qty: 0 }))).toBe("untracked");
    expect(stockStatus(product("beans", { stock_qty: 3 }))).toBe("untracked");
  });

  it("splits a catalog into the four filter buckets", () => {
    const rows = [
      product("out", { stock_qty: 0, low_stock_threshold: 5 }),
      product("low", { stock_qty: 3, low_stock_threshold: 5 }),
      product("ok", { stock_qty: 50, low_stock_threshold: 5 }),
      product("untracked", { stock_qty: 7 }),
    ];
    expect(filterByStockStatus(rows, "low").map((p) => p.name)).toEqual(["low"]);
    expect(filterByStockStatus(rows, "out").map((p) => p.name)).toEqual(["out"]);
    expect(filterByStockStatus(rows, "untracked").map((p) => p.name)).toEqual([
      "untracked",
    ]);
    expect(filterByStockStatus(rows, "all")).toHaveLength(4);
  });

  it("counts the filter chips so healthy lines only show under all", () => {
    const rows = [
      product("out", { stock_qty: 0, low_stock_threshold: 5 }),
      product("low", { stock_qty: 3, low_stock_threshold: 5 }),
      product("ok", { stock_qty: 50, low_stock_threshold: 5 }),
      product("untracked", { stock_qty: 7 }),
    ];
    expect(skusByStatus(rows)).toEqual({
      all: 4,
      low: 1,
      out: 1,
      untracked: 1,
    });
  });

  it("keeps inactive lines out of the alert list", () => {
    const alerts = lowStockAlerts([
      product("beans", { stock_qty: 1, low_stock_threshold: 5 }),
      product("old", { stock_qty: 0, low_stock_threshold: 5, is_active: false }),
    ]);
    expect(alerts.map((p) => p.name)).toEqual(["beans"]);
  });

  it("lists alerts worst stock first", () => {
    const alerts = lowStockAlerts([
      product("almost-gone", { stock_qty: 1, low_stock_threshold: 5 }),
      product("empty", { stock_qty: 0, low_stock_threshold: 5 }),
      product("scratch", { stock_qty: 4, low_stock_threshold: 5 }),
    ]);
    expect(alerts.map((p) => p.name)).toEqual(["empty", "almost-gone", "scratch"]);
  });
});

describe("reorderSuggestion", () => {
  it("tops a low line back up to twice its reorder level", () => {
    expect(reorderSuggestion(product("beans", { stock_qty: 4, low_stock_threshold: 10 }))).toBe(16);
    expect(reorderSuggestion(product("milk", { stock_qty: 0, low_stock_threshold: 6 }))).toBe(12);
  });

  it("suggests nothing for healthy or untracked lines", () => {
    expect(reorderSuggestion(product("beans", { stock_qty: 30, low_stock_threshold: 10 }))).toBe(0);
    expect(reorderSuggestion(product("beans", { stock_qty: 2 }))).toBe(0);
    expect(reorderSuggestion(product("beans", { stock_qty: 2, low_stock_threshold: 0 }))).toBe(0);
  });
});

describe("buildMovementLedger", () => {
  const products = [product("beans"), product("milk"), product("toast")];

  it("newest movement first, adjustments and sales side by side", () => {
    const ledger = buildMovementLedger({
      products,
      adjustments: [
        adjustment("a-old", "beans", 20, "2026-11-01T08:00:00.000Z"),
        adjustment("a-new", "milk", 12, "2026-11-12T08:00:00.000Z"),
      ],
      orders: [order("o1", { created_at: "2026-11-05T10:00:00.000Z" })],
      orderItems: [item("i1", "o1", "beans", 3)],
    });
    expect(ledger.map((m) => m.id)).toEqual(["a-new", "sale-i1", "a-old"]);
    expect(ledger[1]).toMatchObject({ productId: "beans", delta: -3, source: "sale" });
  });

  it("breaks timestamp ties with the adjustment before the sale", () => {
    const at = "2026-11-10T10:00:00.000Z";
    const ledger = buildMovementLedger({
      products,
      adjustments: [adjustment("adj-2", "beans", 5, at), adjustment("adj-1", "milk", 5, at)],
      orders: [order("o1", { created_at: at })],
      orderItems: [item("i1", "o1", "toast", 2), item("i2", "o1", "beans", 1)],
    });
    expect(ledger.map((m) => m.id)).toEqual([
      "adj-1",
      "adj-2",
      "sale-i1",
      "sale-i2",
    ]);
  });

  it("ignores cancelled, refunded and credit-note sales", () => {
    const ledger = buildMovementLedger({
      products,
      adjustments: [],
      orders: [
        order("o-cancelled", { status: "cancelled" }),
        order("o-refunded", { status: "refunded" }),
        order("o-credit", { parent_order_id: "o1", order_kind: "credit_note" }),
      ],
      orderItems: [
        item("i1", "o-cancelled", "beans", 2),
        item("i2", "o-refunded", "milk", 1),
        item("i3", "o-credit", "toast", 4),
      ],
    });
    expect(ledger).toEqual([]);
  });

  it("still reads products that left the catalog", () => {
    const ledger = buildMovementLedger({
      products,
      adjustments: [adjustment("a1", "gone", 4, "2026-11-02T08:00:00.000Z")],
      orders: [order("o1")],
      orderItems: [item("i1", "o1", "gone", 2)],
    });
    expect(ledger.map((m) => m.id)).toEqual(["sale-i1", "a1"]);
    expect(ledger[0].productName).toBe("gone");
    expect(ledger[1].productName).toBe("Removed product");
  });
});

describe("dead stock", () => {
  it("flags active lines holding stock that no order sold", () => {
    const rows = [
      product("sells", { stock_qty: 4 }),
      product("sells-out", { stock_qty: 0 }),
      product("gatherer", { stock_qty: 9 }),
      product("retired", { stock_qty: 9, is_active: false }),
    ];
    const orders = [order("o1")];
    const items = [item("i1", "o1", "sells", 1)];
    expect(
      deadStockCandidates(rows, soldProductIds(orders, items)).map((p) => p.name),
    ).toEqual(["gatherer"]);
  });
});

describe("stockRows", () => {
  it("puts problem lines first and orders inside a status by name", () => {
    const rows = stockRows(
      [
        product("Zeta", { stock_qty: 50, low_stock_threshold: 5 }),
        product("Alpha", { stock_qty: 1, low_stock_threshold: 5 }),
        product("Bravo", { stock_qty: 0, low_stock_threshold: 5 }),
        product("Untracked", { stock_qty: 3 }),
      ],
      "all",
    );
    expect(rows.map((r) => [r.product.name, r.status])).toEqual([
      ["Bravo", "out"],
      ["Alpha", "low"],
      ["Untracked", "untracked"],
      ["Zeta", "ok"],
    ]);
  });
});
