import { describe, expect, it, vi } from "vitest";
import {
  aggregateOrderUsage,
  consumptionMovements,
  costPerUnit,
  formatUnitCount,
  ingredientsForProduct,
  inventoryCategories,
  inventoryPosition,
  inventoryPositions,
  isConsumingOrder,
  lowStockPositions,
  packsToUnits,
  recipeCostPerSale,
  unitsToPacks,
  usageForOrderItems,
} from "./stock";
import type {
  InventoryAdjustment,
  InventoryItem,
  Order,
  OrderItem,
  ProductIngredient,
} from "@/types/database";

type ItemSeed = Partial<InventoryItem> & { id: string };

const itemBase = {
  brand_id: "b1",
  name: "Sourdough",
  category: "Bakery",
  unit: "slice",
  units_per_pack: 18,
  cost_per_pack: 90,
  stock_packs: 10,
  low_stock_packs: 4,
  note: null,
};

const item = (over: ItemSeed): InventoryItem => ({ ...itemBase, ...over });

const move = (
  id: string,
  itemId: string,
  deltaPacks: number,
  kind: InventoryAdjustment["kind"] = "issue",
): InventoryAdjustment => ({
  id,
  brand_id: "b1",
  item_id: itemId,
  delta_packs: deltaPacks,
  kind,
  cost: null,
  note: null,
  created_at: "2026-11-10T09:00:00.000Z",
});

const order = (over: Partial<Order>): Order => ({
  id: "o1",
  brand_id: "b1",
  order_number: "OB-1",
  status: "completed",
  payment_status: "paid",
  customer_id: null,
  customer_name_snapshot: "Walk-in",
  subtotal: 100,
  discount_total: 0,
  tax_total: 0,
  fees_total: 0,
  grand_total: 100,
  notes: null,
  created_at: "2026-11-10T09:00:00.000Z",
  ...over,
});

const billLine = (over: Partial<OrderItem> & { id: string }): OrderItem => ({
  order_id: "o1",
  product_id: "p-sandwich",
  product_name_snapshot: "Sandwich",
  quantity: 1,
  unit_price: 0,
  line_discount: 0,
  line_total: 0,
  ...over,
});

const ingredient = (
  id: string,
  productId: string,
  itemId: string,
  qtyPerSale: number,
): ProductIngredient => ({
  id,
  brand_id: "b1",
  product_id: productId,
  item_id: itemId,
  qty_per_sale: qtyPerSale,
  note: null,
});

describe("pack maths", () => {
  it("converts through the pack size", () => {
    const bread = item({ id: "i", units_per_pack: 18, cost_per_pack: 90 });
    expect(costPerUnit(bread)).toBe(5);
    expect(unitsToPacks(bread, 6)).toBeCloseTo(1 / 3, 10);
    expect(packsToUnits(bread, 0.5)).toBe(9);
    // The raw division is not rounded; only the reports are.
    expect(costPerUnit(item({ id: "i", units_per_pack: 3, cost_per_pack: 10 }))).toBe(10 / 3);
  });

  it("guards a pack size of zero or less", () => {
    for (const units_per_pack of [0, -2]) {
      const broken = item({ id: "i", units_per_pack, cost_per_pack: 100 });
      expect(costPerUnit(broken)).toBe(0);
      expect(unitsToPacks(broken, 10)).toBe(0);
      expect(Number.isFinite(costPerUnit(broken))).toBe(true);
      expect(Number.isNaN(unitsToPacks(broken, 10))).toBe(false);
      expect(inventoryPosition(broken, []).costPerUnit).toBe(0);
    }
    expect(packsToUnits(item({ id: "i", units_per_pack: 0 }), 4)).toBe(0);
  });
});

describe("inventoryPosition", () => {
  it("reads the shelf as opening stock plus the ledger", () => {
    const pos = inventoryPosition(item({ id: "i" }), [
      move("m1", "i", 2, "purchase"),
      move("m2", "i", -1, "waste"),
    ]);
    expect(pos.packs).toBe(11);
    expect(pos.units).toBe(198); // 11 packs x 18 slices
    expect(pos.costPerUnit).toBe(5);
    expect(pos.value).toBe(990); // 11 packs x 90
    expect(pos.status).toBe("ok");
    expect(pos.shortBy).toBe(0);
  });

  it("carries a fractional issue and floors the shelf at zero", () => {
    const partial = inventoryPosition(item({ id: "i" }), [move("m1", "i", -0.33)]);
    expect(partial.packs).toBe(9.67);
    expect(partial.units).toBe(174.06);
    expect(partial.value).toBe(870.3);

    const floored = inventoryPosition(item({ id: "i", stock_packs: 2 }), [
      move("m1", "i", -5),
    ]);
    expect(floored.packs).toBe(0); // an over-issue cannot make stock negative
    expect(floored.units).toBe(0);
    expect(floored.value).toBe(0);
    expect(floored.shortBy).toBe(4);
    expect(floored.status).toBe("out");
  });

  it("rounds counts to 3 dp and money to 2 dp", () => {
    const pos = inventoryPosition(item({ id: "i", stock_packs: 1 }), [
      move("m1", "i", -0.6667),
    ]);
    expect(pos.packs).toBe(0.333);
    expect(pos.units).toBe(5.994);
    expect(pos.value).toBe(29.97);
    expect(pos.shortBy).toBe(3.667);
    expect(inventoryPosition(item({ id: "i", units_per_pack: 3, cost_per_pack: 10 }), [])
      .costPerUnit).toBe(3.33);
  });

  it("draws the status line on packs, out before low", () => {
    const status = (packs: number, low: number) =>
      inventoryPosition(item({ id: "i", stock_packs: packs, low_stock_packs: low }), [])
        .status;
    expect(status(0, 0)).toBe("out");
    expect(status(0, 4)).toBe("out");
    expect(status(3.999, 4)).toBe("low");
    expect(status(4, 4)).toBe("low"); // sitting on the reorder line is still low
    expect(status(4.001, 4)).toBe("ok");
    expect(status(12, 4)).toBe("ok");
  });

  it("ignores ledger rows that belong to another item", () => {
    const ledger = [move("m1", "other", 5, "purchase"), move("m2", "other", -9)];
    expect(inventoryPosition(item({ id: "i" }), ledger).packs).toBe(10);
    const positions = inventoryPositions(
      [item({ id: "i" }), item({ id: "other", stock_packs: 1 })],
      ledger,
    );
    expect(positions.map((p) => p.item.id)).toEqual(["i", "other"]);
    expect(positions.map((p) => p.packs)).toEqual([10, 0]); // 1 + 5 - 9, floored
  });
});

describe("isConsumingOrder", () => {
  it("excludes quotations, cancelled bills, refunds and credit notes", () => {
    for (const status of ["draft", "cancelled", "refunded"] as const) {
      expect(isConsumingOrder(order({ status }))).toBe(false);
    }
    expect(isConsumingOrder(order({ status: "completed", order_kind: "credit_note" })))
      .toBe(false);
    expect(isConsumingOrder(order({ status: "pending", order_kind: "credit_note" })))
      .toBe(false);
  });

  it("counts every real commitment", () => {
    for (const status of ["pending", "confirmed", "completed"] as const) {
      expect(isConsumingOrder(order({ status }))).toBe(true);
    }
    expect(isConsumingOrder(order({ status: "completed", order_kind: "sale" }))).toBe(true);
    expect(isConsumingOrder(order({ status: "completed", order_kind: null }))).toBe(true);
  });
});

describe("recipeCostPerSale", () => {
  const bread = item({ id: "i-bread", name: "Sourdough", unit: "slice",
    units_per_pack: 18, cost_per_pack: 90 }); // 5 a slice
  const butter = item({ id: "i-butter", name: "Butter", unit: "g",
    units_per_pack: 500, cost_per_pack: 250 }); // 0.5 a gram
  const sandwich = [
    ingredient("g1", "p-sandwich", "i-bread", 2),
    ingredient("g2", "p-sandwich", "i-butter", 10),
  ];

  it("sums qty_per_sale x costPerUnit in the merchant's own order", () => {
    expect(recipeCostPerSale(sandwich, [bread, butter])).toBe(15); // 2 x 5 + 10 x 0.5
    expect(recipeCostPerSale([], [bread, butter])).toBe(0);
    expect(ingredientsForProduct("p-toast", [...sandwich, ingredient("g3", "p-toast",
      "i-bread", 1)])).toEqual([ingredient("g3", "p-toast", "i-bread", 1)]);
  });

  it("skips rows whose item_id does not resolve instead of pricing them", () => {
    const withGhost = [...sandwich, ingredient("g9", "p-sandwich", "i-missing", 100)];
    const result = recipeCostPerSale(withGhost, [bread, butter]);
    expect(result).toBe(15);
    expect(Number.isFinite(result)).toBe(true);
  });

  it("rounds the cost of one sale to 2 dp", () => {
    const thirds = item({ id: "i-third", units_per_pack: 3, cost_per_pack: 1 });
    expect(recipeCostPerSale([ingredient("g1", "p-sandwich", "i-third", 2)], [thirds]))
      .toBe(0.67);
  });
});

describe("usage", () => {
  const bread = item({ id: "i-bread", name: "Sourdough", unit: "slice",
    units_per_pack: 18, cost_per_pack: 90 }); // 5 a slice
  const butter = item({ id: "i-butter", name: "Butter", unit: "g",
    units_per_pack: 500, cost_per_pack: 250 }); // 0.5 a gram
  const items = [bread, butter];
  const recipes = [
    ingredient("g1", "p-sandwich", "i-bread", 2),
    ingredient("g2", "p-sandwich", "i-butter", 10),
    ingredient("g3", "p-toast", "i-bread", 1),
    ingredient("g4", "p-toast", "i-butter", 5),
    ingredient("g5", "p-ghost", "i-missing", 3),
  ];
  const lines = [
    billLine({ id: "l1", product_id: "p-sandwich", quantity: 3 }),
    billLine({ id: "l2", product_id: null, product_name_snapshot: "Napkins", quantity: 5 }),
    billLine({ id: "l3", product_id: "p-no-recipe", product_name_snapshot: "Filter coffee" }),
    billLine({ id: "l4", product_id: "p-ghost", product_name_snapshot: "Mystery" }),
    billLine({ id: "l5", product_id: "p-toast", product_name_snapshot: "Toast", quantity: 0 }),
    billLine({ id: "l6", product_id: "p-toast", product_name_snapshot: "Toast", quantity: 2 }),
  ];

  it("multiplies the recipe by the quantity and skips lines that use nothing", () => {
    expect(usageForOrderItems(lines, recipes, items)).toEqual([
      {
        orderItemId: "l1",
        productId: "p-sandwich",
        productName: "Sandwich",
        quantity: 3,
        rows: [
          { itemId: "i-bread", itemName: "Sourdough", unit: "slice", units: 6,
            packs: 0.333, cost: 30 },
          { itemId: "i-butter", itemName: "Butter", unit: "g", units: 30,
            packs: 0.06, cost: 15 },
        ],
        cost: 45,
      },
      {
        orderItemId: "l6",
        productId: "p-toast",
        productName: "Toast",
        quantity: 2,
        rows: [
          { itemId: "i-bread", itemName: "Sourdough", unit: "slice", units: 2,
            packs: 0.111, cost: 10 },
          { itemId: "i-butter", itemName: "Butter", unit: "g", units: 10,
            packs: 0.02, cost: 5 },
        ],
        cost: 15,
      },
    ]);
  });

  it("sorts rows by descending cost and totals them per line", () => {
    const usage = usageForOrderItems(lines, recipes, items);
    expect(usage.map((l) => l.rows.map((r) => r.cost))).toEqual([[30, 15], [10, 5]]);
    expect(usage.map((l) => l.cost)).toEqual([45, 15]);
  });

  it("orders by cost, not by the order the merchant typed the recipe", () => {
    const club = [
      ingredient("g6", "p-club", "i-butter", 5), // 2.50
      ingredient("g7", "p-club", "i-bread", 4), // 20.00
    ];
    const rows = usageForOrderItems(
      [billLine({ id: "l7", product_id: "p-club", product_name_snapshot: "Club sandwich" })],
      club,
      items,
    )[0].rows;
    expect(rows.map((r) => [r.itemId, r.units, r.packs, r.cost]))
      .toEqual([["i-bread", 4, 0.222, 20], ["i-butter", 5, 0.01, 2.5]]);
  });

  it("merges two recipe rows that name the same stock item", () => {
    const doubled = [
      ingredient("g8", "p-bun", "i-bread", 2),
      ingredient("g9", "p-bun", "i-bread", 1),
    ];
    const rows = usageForOrderItems(
      [billLine({ id: "l8", product_id: "p-bun", product_name_snapshot: "Bun", quantity: 3 })],
      doubled,
      items,
    )[0].rows;
    expect(rows).toEqual([
      { itemId: "i-bread", itemName: "Sourdough", unit: "slice", units: 9,
        packs: 0.5, cost: 45 },
    ]);
  });

  it("merges the same item across lines and agrees with the per-line cost", () => {
    const usage = usageForOrderItems(lines, recipes, items);
    const agg = aggregateOrderUsage(lines, recipes, items);
    expect(agg).toEqual([
      { itemId: "i-bread", itemName: "Sourdough", unit: "slice", units: 8,
        packs: 0.444, cost: 40 },
      { itemId: "i-butter", itemName: "Butter", unit: "g", units: 40,
        packs: 0.08, cost: 20 },
    ]);
    expect(agg.reduce((sum, row) => sum + row.cost, 0))
      .toBe(usage.reduce((sum, l) => sum + l.cost, 0));
    expect(aggregateOrderUsage([], recipes, items)).toEqual([]);
  });

  it("reports no usage for a brand without recipes", () => {
    expect(usageForOrderItems(lines, [], items)).toEqual([]);
    expect(aggregateOrderUsage(lines, [], items)).toEqual([]);
  });
});

describe("consumptionMovements", () => {
  const used = [
    { itemId: "i-bread", itemName: "Sourdough", unit: "slice", units: 8,
      packs: 0.444, cost: 40 },
    { itemId: "i-salt", itemName: "Salt", unit: "g", units: 0, packs: 0, cost: 0 },
    { itemId: "i-butter", itemName: "Butter", unit: "g", units: 40, packs: 0.08, cost: 20 },
  ];

  it("issues one negative row per used pack, noted with the order number", () => {
    let seq = 0;
    const newId = vi.fn((): string => `mv-${++seq}`);
    const movements = consumptionMovements(used, {
      brandId: "b9",
      orderNumber: "OB-77",
      createdAt: "2026-11-11T09:00:00.000Z",
      newId,
    });
    expect(movements).toEqual([
      { id: "mv-1", brand_id: "b9", item_id: "i-bread", delta_packs: -0.444,
        kind: "issue", cost: null, note: "OB-77", created_at: "2026-11-11T09:00:00.000Z" },
      { id: "mv-2", brand_id: "b9", item_id: "i-butter", delta_packs: -0.08,
        kind: "issue", cost: null, note: "OB-77", created_at: "2026-11-11T09:00:00.000Z" },
    ]);
    // The zero-pack row is dropped before ids are handed out, so none is skipped.
    expect(newId).toHaveBeenCalledTimes(2);
    expect(movements.every((m) => m.delta_packs < 0)).toBe(true);
  });

  it("drains each shelf when the movements go back through the ledger", () => {
    const movements = consumptionMovements(used, {
      brandId: "b1", orderNumber: "OB-77", createdAt: "2026-11-11T09:00:00.000Z",
      newId: () => "mv",
    });
    const positions = inventoryPositions(
      [
        item({ id: "i-bread", stock_packs: 10 }),
        item({ id: "i-butter", name: "Butter", unit: "g", units_per_pack: 500,
          cost_per_pack: 250, stock_packs: 10, low_stock_packs: 4 }),
      ],
      movements,
    );
    // Each item only feels its own row: 10 - 0.444 and 10 - 0.08 packs.
    expect(positions.map((p) => [p.packs, p.units])).toEqual([[9.556, 172.008], [9.92, 4960]]);
    expect(positions.map((p) => p.status)).toEqual(["ok", "ok"]);
  });
});

describe("formatUnitCount", () => {
  it("pluralises counted units", () => {
    expect(formatUnitCount(1, "slice")).toBe("1 slice");
    expect(formatUnitCount(2, "slice")).toBe("2 slices");
    expect(formatUnitCount(6, "slice")).toBe("6 slices");
    expect(formatUnitCount(0, "slice")).toBe("0 slices");
    expect(formatUnitCount(1, "shot")).toBe("1 shot");
    expect(formatUnitCount(-1, "pack")).toBe("-1 pack");
  });

  it("never pluralises the uncounted set", () => {
    for (const unit of ["g", "kg", "ml", "l", "sq ft", "ea"]) {
      expect(formatUnitCount(1, unit)).toBe(`1 ${unit}`);
      expect(formatUnitCount(2, unit)).toBe(`2 ${unit}`);
    }
  });

  it("shows fractions at 1 dp", () => {
    expect(formatUnitCount(1 / 3, "slice")).toBe("0.3 slices");
    expect(formatUnitCount(1.25, "slice")).toBe("1.3 slices");
    expect(formatUnitCount(2.5, "kg")).toBe("2.5 kg");
  });
});

describe("categories and the reorder list", () => {
  it("dedupes categories, labels blanks and sorts them", () => {
    expect(inventoryCategories([
      item({ id: "a", category: "Produce" }),
      item({ id: "b", category: null }),
      item({ id: "c", category: "Dairy" }),
      item({ id: "d", category: "Dairy" }),
    ])).toEqual(["Dairy", "Produce", "Uncategorized"]);
    expect(inventoryCategories([])).toEqual([]);
  });

  it("keeps low and out positions, dropping the healthy ones", () => {
    const items = [
      item({ id: "i-ok", stock_packs: 12, low_stock_packs: 4 }),
      item({ id: "i-low", stock_packs: 4, low_stock_packs: 4 }),
      item({ id: "i-out", stock_packs: 0, low_stock_packs: 4 }),
    ];
    expect(lowStockPositions(items, []).map((p) => p.item.id)).toEqual(["i-low", "i-out"]);
    // A purchase can lift an item out of the list, so the ledger is consulted.
    expect(lowStockPositions(items, [move("m1", "i-low", 1, "purchase")])
      .map((p) => p.item.id)).toEqual(["i-out"]);
  });
});
